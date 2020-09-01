import React, { useEffect, useReducer } from 'react';
import { Box, Collapse, Flex, Icon, IconButton, Text } from '@chakra-ui/core';
import { RiExchangeLine } from 'react-icons/ri';
import CurrencyAmount from './CurrencyAmount';
import { Currency } from '../utils/currency';
import {
  Protocol,
  SwapAction,
  SwapActionKind,
  SwapEntity,
  SwapEvent,
  SwapEventName,
  SwapProperties
} from '../utils/swap';
import SwapStep, { SwapStepName } from './SwapStep';
import { LedgerAction } from '../comit-sdk';
import { useLedgerBitcoinWallet } from '../hooks/useLedgerBitcoinWallet';
import useSWR from 'swr/esm/use-swr';
import { useCnd } from '../hooks/useCnd';
import { AxiosResponse } from 'axios';

export interface SwapRowProps {
  href: string;
}

type ComponentAction = {
  type: 'fetchedSwap',
  value: {
    swap: SwapProperties,
    ledgerAction?: LedgerAction
  }
} | {
  type: 'actionCompleted',
  value: string
};

enum ActionStatus {
  NOT_READY_YET,
  AWAITING_USER_INTERACTION, // for actions that require user interaction
  READY_FOR_EXECUTION, // for actions that don't require user interaction
  TRYING_TO_EXECUTE, // when we trigger ledger and await the wallet's response for sending the tx
  // TODO: Display tx-id for this case
  WAITING_CONFIRMATION, // once we have the wallet's response for sending the tx
  // TODO: Most likely we can remove this state because events are enough to deal with this
  CONFIRMED,
}

function findSwapEventInSwap(swap: SwapProperties, eventName: SwapEventName): SwapEvent | undefined {
  return swap.events.find((event) => event.name === eventName);
}

interface State {
  swap: SwapProperties;
  alreadySeenActions: SwapAction[]; // needed becaus cnd keeps returning actions that were already "processed" but cnd did not pick up the blockchain transaction yet

  activeAction: SwapAction; // the action currently being processed, there can only be one.
  activeActionStatus: ActionStatus; // the state of the action currently being processed.
  activeActionTxId?: string; // transaction id of the currently active action
  ledgerAction?: LedgerAction
}

function actionToInitialState(action: SwapActionKind, protocol: Protocol): ActionStatus {
  if (protocol === Protocol.HER20 && (
    action === SwapActionKind.DEPLOY
    || action === SwapActionKind.FUND)) {
    return ActionStatus.AWAITING_USER_INTERACTION;
  }

  if (protocol === Protocol.HBIT && (
    action === SwapActionKind.FUND
    || action === SwapActionKind.REDEEM)) {
    return ActionStatus.AWAITING_USER_INTERACTION;
  }

  return ActionStatus.READY_FOR_EXECUTION;
}

function reducer(state: State, action: ComponentAction): State {
  switch (action.type) {
    case 'fetchedSwap':
      let { swap, ledgerAction } = action.value;

      // if swap undefined nothing to do
      if (!swap) {
        return state;
      }

      // if no action available, set swap, nothing else to do
      if (!swap.action) {
        return {
          ...state,
          swap
        };
      }

      let actionAlreadySeen = state.alreadySeenActions.find((action) => action === swap.action);

      // if action already known, set swap, nothing else to do
      if (actionAlreadySeen) {
        return {
          ...state,
          swap
        };
      }

      let newActiveAction = swap.action;
      let newAlreadySeenActions = state.alreadySeenActions;
      newAlreadySeenActions.push(newActiveAction);

      return {
        ...state,
        swap,
        alreadySeenActions: newAlreadySeenActions,
        activeAction: newActiveAction,
        activeActionStatus: actionToInitialState(newActiveAction.name, swap.alpha.protocol),
        ledgerAction
      };
    case 'actionCompleted': {
      return {
        ...state,
        ledgerAction: null,
        activeActionTxId: action.value,
        activeActionStatus: ActionStatus.WAITING_CONFIRMATION
      };
    }
    default:
      throw new Error();
  }
}

function containsEvent(events: SwapEvent[], eventName: SwapEventName) {
  return events.find((event) => event.name === eventName) !== undefined;
}

export default function SwapRow({ href }: SwapRowProps) {
  const cnd = useCnd();
  const bitcoinWallet = useLedgerBitcoinWallet();
  const [show, setShow] = React.useState(false);
  const initialState: State = {
    activeAction: null,
    activeActionStatus: null,
    alreadySeenActions: [],
    swap: null

  };
  const { data: swapResponse } = useSWR<AxiosResponse<SwapEntity>>(
    href,
    path => cnd.fetch(path),
    {
      refreshInterval: 1000
    }
  );

  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    if (swapResponse && swapResponse.data) {
      const body = swapResponse.data;

      const action = body.actions[0];
      const swap = {
        action: action,
        alpha: body.properties.alpha,
        beta: body.properties.beta,
        events: body.properties.events,
        role: body.properties.role
      };

      if (action) {
        fetch(action.href).then(r => r.json()).then((ledgerAction: LedgerAction) => {
          dispatch({ type: 'fetchedSwap', value: { swap, ledgerAction } });
        });
      } else {
        dispatch({ type: 'fetchedSwap', value: { swap, ledgerAction: null } });
      }
    }

  }, [swapResponse]);
  const ledgerAction = state.ledgerAction;

  useEffect(() => {
    if (ledgerAction && ledgerAction.type === 'bitcoin-broadcast-signed-transaction') {
      bitcoinWallet.broadcastRawTransaction(ledgerAction.payload.hex)
        .then(txId => dispatch({ type: 'actionCompleted', value: txId }));
    }
  }, [ledgerAction]);


  const handleDetailsToggle = () => setShow(!show);

  const swap = state.swap;
  if (!swap) {
    return null;
  }

  let sendAmount;
  let sendCurrency;
  let receiveAmount;
  let receiveCurrency;

  let alpha = swap.alpha;
  let beta = swap.beta;

  if (swap.role === 'Alice') {
    sendAmount = alpha.asset;
    sendCurrency = alpha.protocol === Protocol.HBIT ? Currency.BTC : Currency.DAI;
    receiveAmount = beta.asset;
    receiveCurrency = beta.protocol === Protocol.HBIT ? Currency.BTC : Currency.DAI;
  } else {
    receiveAmount = alpha.asset;
    receiveCurrency = alpha.protocol === Protocol.HBIT ? Currency.BTC : Currency.DAI;
    sendAmount = beta.asset;
    sendCurrency = beta.protocol === Protocol.HBIT ? Currency.BTC : Currency.DAI;
  }

  const sendAmountLabel = 'You send';
  const receiveAmountLabel = 'You receive';

  const sendAmountDisplay =
    sendCurrency === Currency.BTC ? (
      <CurrencyAmount
        currencyValue={sendAmount}
        topText={sendAmountLabel}
      />
    ) : (
      <CurrencyAmount
        currencyValue={sendAmount}
        topText={sendAmountLabel}
      />
    );

  const receiveAmountDisplay =
    receiveCurrency === Currency.BTC ? (
      <CurrencyAmount
        currencyValue={receiveAmount}
        topText={receiveAmountLabel}
      />
    ) : (
      <CurrencyAmount
        currencyValue={receiveAmount}
        topText={receiveAmountLabel}
      />
    );

  function isSwapStepActive(swapStep: SwapStepName, alphaProtocol: Protocol) {
    let activeAction = state.activeAction;

    if (!activeAction) {
      return false;
    }

    let events = swap.events;

    if (alphaProtocol === Protocol.HER20) {
      switch (swapStep) {
        case SwapStepName.HERC20_HBIT_ALICE_DEPLOY:
          return activeAction.name === SwapActionKind.DEPLOY
            && !containsEvent(events, SwapEventName.HERC20_DEPLOYED);
        case SwapStepName.HERC20_HBIT_ALICE_FUND:
          return activeAction.name === SwapActionKind.FUND
            && containsEvent(events, SwapEventName.HERC20_DEPLOYED)
            && !containsEvent(events, SwapEventName.HERC20_FUNDED);
        case SwapStepName.HERC20_HBIT_BOB_FUND:
          return containsEvent(events, SwapEventName.HERC20_DEPLOYED)
            && containsEvent(events, SwapEventName.HERC20_FUNDED)
            && !containsEvent(events, SwapEventName.HBIT_FUNDED);
        case SwapStepName.HERC20_HBIT_ALICE_REDEEM:
          return activeAction.name === SwapActionKind.REDEEM
            && containsEvent(events, SwapEventName.HERC20_DEPLOYED)
            && containsEvent(events, SwapEventName.HERC20_FUNDED)
            && containsEvent(events, SwapEventName.HBIT_FUNDED)
            && !containsEvent(events, SwapEventName.HBIT_REDEEMED);
        default:
          return false;
      }
    } else {
      switch (swapStep) {
        case SwapStepName.HBIT_HERC20_ALICE_FUND:
          return activeAction.name === SwapActionKind.FUND
            && !containsEvent(events, SwapEventName.HBIT_FUNDED);
        case SwapStepName.HBIT_HERC20_BOB_FUND:
          return containsEvent(events, SwapEventName.HBIT_FUNDED)
            && !containsEvent(events, SwapEventName.HERC20_FUNDED);
        case SwapStepName.HBIT_HERC20_ALICE_REDEEM:
          return activeAction.name === SwapActionKind.REDEEM
            && containsEvent(events, SwapEventName.HBIT_FUNDED)
            && containsEvent(events, SwapEventName.HERC20_DEPLOYED)
            && containsEvent(events, SwapEventName.HERC20_FUNDED);
        default:
          return false;
      }
    }
  }

  function isLedgerInteractionButtonActive(swapStep: SwapStepName, alphaProtocol: Protocol): boolean {
    return isSwapStepActive(swapStep, alphaProtocol) && state.activeActionStatus === ActionStatus.AWAITING_USER_INTERACTION;
  }

  interface SwapStatusProperties {
    protocol: Protocol
  }

  const SwapStatus = ({ protocol }: SwapStatusProperties) => {
    let StepArrow = () => {
      return (
        <Flex alignSelf="flex-start" marginTop="1.8rem">
          <Icon name="arrow-right" color="gray.400" marginLeft="0.3rem" marginRight="0.3rem"/>
        </Flex>
      );
    };

    if (protocol === Protocol.HER20) {
      return (
        <Flex direction="row" align="center" width="100%" justifyContent="space-between" alignItems="baseline"
              padding="0.5rem" key={href + 'swapSteps'}>
          <Box width="25%">
            <SwapStep
              swapId={href}
              name={SwapStepName.HERC20_HBIT_ALICE_DEPLOY}
              isActive={isSwapStepActive(SwapStepName.HERC20_HBIT_ALICE_DEPLOY, protocol)}
              isUserInteractionActive={isLedgerInteractionButtonActive(SwapStepName.HERC20_HBIT_ALICE_DEPLOY, protocol)}
              event={findSwapEventInSwap(swap, SwapEventName.HERC20_DEPLOYED)}
              ledgerAction={state.ledgerAction}
              onSigned={(txId) => {
                dispatch({ type: 'actionCompleted', value: txId });
              }}
            />
          </Box>
          <StepArrow/>
          <Box width="25%">
            <SwapStep
              swapId={href}
              name={SwapStepName.HERC20_HBIT_ALICE_FUND}
              isActive={isSwapStepActive(SwapStepName.HERC20_HBIT_ALICE_FUND, protocol)}
              isUserInteractionActive={isLedgerInteractionButtonActive(SwapStepName.HERC20_HBIT_ALICE_FUND, protocol)}
              event={findSwapEventInSwap(swap, SwapEventName.HERC20_FUNDED)}
              ledgerAction={state.ledgerAction}
              onSigned={(txId) => {
                dispatch({ type: 'actionCompleted', value: txId });
              }}
            />
          </Box>
          <StepArrow/>
          <Box width="25%">
            <SwapStep
              swapId={href}
              name={SwapStepName.HERC20_HBIT_BOB_FUND}
              isActive={isSwapStepActive(SwapStepName.HERC20_HBIT_BOB_FUND, protocol)}
              isUserInteractionActive={isLedgerInteractionButtonActive(SwapStepName.HERC20_HBIT_BOB_FUND, protocol)}
              event={findSwapEventInSwap(swap, SwapEventName.HBIT_FUNDED)}
              ledgerAction={state.ledgerAction}
              onSigned={(txId) => {
                dispatch({ type: 'actionCompleted', value: txId });
              }}
            />
          </Box>
          <StepArrow/>
          <Box width="25%">
            <SwapStep
              swapId={href}
              name={SwapStepName.HERC20_HBIT_ALICE_REDEEM}
              isActive={isSwapStepActive(SwapStepName.HERC20_HBIT_ALICE_REDEEM, protocol)}
              isUserInteractionActive={isLedgerInteractionButtonActive(SwapStepName.HERC20_HBIT_ALICE_REDEEM, protocol)}
              event={findSwapEventInSwap(swap, SwapEventName.HBIT_REDEEMED)}
              ledgerAction={state.ledgerAction}
              onSigned={(txId) => {
                dispatch({ type: 'actionCompleted', value: txId });
              }}
            />
          </Box>
        </Flex>
      );
    } else {
      return (
        <Flex direction="row" align="center" width="100%" justifyContent="space-between" alignItems="baseline"
              padding="0.5rem" key={href + 'swapSteps'}>
          <Box width="30%">
            <SwapStep
              swapId={href}
              name={SwapStepName.HBIT_HERC20_ALICE_FUND}
              isActive={isSwapStepActive(SwapStepName.HBIT_HERC20_ALICE_FUND, protocol)}
              isUserInteractionActive={isLedgerInteractionButtonActive(SwapStepName.HBIT_HERC20_ALICE_FUND, protocol)}
              event={findSwapEventInSwap(swap, SwapEventName.HBIT_FUNDED)}
              ledgerAction={state.ledgerAction}
              onSigned={(txId) => {
                dispatch({ type: 'actionCompleted', value: txId });
              }}
            />
          </Box>
          <StepArrow/>
          <Box width="30%">
            <SwapStep
              swapId={href}
              name={SwapStepName.HBIT_HERC20_BOB_FUND}
              isActive={isSwapStepActive(SwapStepName.HBIT_HERC20_BOB_FUND, protocol)}
              isUserInteractionActive={isLedgerInteractionButtonActive(SwapStepName.HBIT_HERC20_BOB_FUND, protocol)}
              event={findSwapEventInSwap(swap, SwapEventName.HERC20_FUNDED)}
              ledgerAction={state.ledgerAction}
              onSigned={(txId) => {
                dispatch({ type: 'actionCompleted', value: txId });
              }}
            />
          </Box>
          <StepArrow/>
          <Box width="30%">
            <SwapStep
              swapId={href}
              name={SwapStepName.HBIT_HERC20_ALICE_REDEEM}
              isActive={isSwapStepActive(SwapStepName.HBIT_HERC20_ALICE_REDEEM, protocol)}
              isUserInteractionActive={isLedgerInteractionButtonActive(SwapStepName.HBIT_HERC20_ALICE_REDEEM, protocol)}
              event={findSwapEventInSwap(swap, SwapEventName.HERC20_REDEEMED)}
              ledgerAction={state.ledgerAction}
              onSigned={(txId) => {
                dispatch({ type: 'actionCompleted', value: txId });
              }}
            />
          </Box>
        </Flex>
      );
    }
  };

  function enumKeys<E>(e: E): (keyof E)[] {
    return Object.keys(e) as (keyof E)[];
  }

  const ActiveStep = () => {
    for (const key of enumKeys(SwapStepName)) {
      let swapStepEnumVal = SwapStepName[key];
      let isActive = isSwapStepActive(swapStepEnumVal, swap.alpha.protocol);
      if (isActive) {
        return (
          <SwapStep
            swapId={href}
            name={swapStepEnumVal}
            isActive={true}
            isUserInteractionActive={isLedgerInteractionButtonActive(swapStepEnumVal, swap.alpha.protocol)}
            event={undefined}
            asActiveStep={true}
            ledgerAction={state.ledgerAction}
            onSigned={(txId) => {
              dispatch({ type: 'actionCompleted', value: txId });
            }}
          />
        );
      }
    }

    return <></>;
  };

  return (
    <Box maxWidth="100%" border="1px" borderColor="gray.400" marginBottom="1rem" rounded="lg" key={href}
         backgroundColor="gray.100">
      <Flex direction="column">
        <Flex
          direction="row"
          alignItems="center"
          padding="0.5rem"
          borderBottomWidth={show ? '1px' : 0}
          borderBottomColor="gray.300"
        >
          <Box>
            <Box as={RiExchangeLine} size="30px" marginRight="0.3rem"/>
          </Box>
          {/* <Spinner size="sm" marginLeft="10px" marginRight="20px"/> */}
          <Text fontSize="md" marginRight="20px" fontWeight="bold">
            Swap
          </Text>
          <Flex marginRight="20px">{sendAmountDisplay}</Flex>
          <Flex>{receiveAmountDisplay}</Flex>
          {
            show
              ? <></>
              : <Flex alignItems="center"><Text fontWeight="bold">Status: </Text></Flex>
          }
          <Flex width="100%"/>
          {
            show ? <></> : <ActiveStep/>
          }
          <IconButton
            aria-label="Swap Details"
            icon={show ? 'chevron-up' : 'chevron-down'}
            onClick={handleDetailsToggle}
          >
            Show details
          </IconButton>
        </Flex>
        <Collapse isOpen={show}>
          <SwapStatus protocol={swap.alpha.protocol}/>
        </Collapse>
      </Flex>
    </Box>
  );
}
