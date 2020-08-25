import {
  Box,
  Flex,
  Image,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  Tooltip
} from '@chakra-ui/core';
import React from 'react';
import { toBitcoin } from 'satoshi-bitcoin-ts';
import { formatEther, formatUnits } from 'ethers/lib/utils';
import { RiCoinLine } from 'react-icons/all';
import BitcoinIcon from '../assets/Bitcoin.svg';
import DaiIcon from '../assets/Dai.svg';
import EthereumIcon from '../assets/Ethereum.svg';
import { Currency, CurrencyUnit, CurrencyValue } from '../utils/types';

interface CurrencyAndUnit {
  currency: Currency;
  unit: CurrencyUnit;
}

// TODO: Refactor to just use CurrencyValue decimals and the currency label
function getCurrencyAndUnit(currencyValue: CurrencyValue): CurrencyAndUnit {
  let unit = CurrencyUnit.SATOSHI;
  let currency = Currency.BTC;

  if (currencyValue.currency === 'BTC') {
    currency = Currency.BTC;
    if (currencyValue.decimals === 8) {
      unit = CurrencyUnit.SATOSHI;
    } else {
      unit = CurrencyUnit.BTC;
    }
  } else if (currencyValue.currency === 'DAI') {
    currency = Currency.DAI;
    if (currencyValue.decimals === 18) {
      unit = CurrencyUnit.ATTO;
    } else {
      unit = CurrencyUnit.DAI;
    }
  } else if (currencyValue.currency === 'ETH') {
    currency = Currency.ETH;
    if (currencyValue.decimals === 18) {
      unit = CurrencyUnit.WEI;
    } else {
      unit = CurrencyUnit.ETHER;
    }
  }

  return {
    currency,
    unit
  };
}

export enum ColorMode {
  RED = 'RED',
  GREEN = 'GREEN',
  WHITE = 'WHITE'
}

interface CurrencyAmountProps {
  currencyValue: CurrencyValue;
  topText?: string;
  subText1?: string;
  subText2?: string;
  amountShortenPosition?: number;
  amountFontSize?: string;
  iconHeight?: string;
  colourMode?: ColorMode;
}

const currencyIcon = (currency: Currency, iconHeight?: string) => {
  let displayHeight = iconHeight;
  if (!displayHeight) {
    displayHeight = '1.5rem';
  }

  switch (currency) {
    case Currency.BTC:
      return (
        <Image
          src={BitcoinIcon}
          height={displayHeight}
          marginRight="0.5rem"
          alignSelf="center"
        />
      );
    case Currency.DAI:
      return (
        <Image
          src={DaiIcon}
          height={displayHeight}
          marginRight="0.5rem"
          alignSelf="center"
        />
      );
    case Currency.ETH:
      return (
        <Image
          src={EthereumIcon}
          height={displayHeight}
          marginRight="0.5rem"
          alignSelf="center"
        />
      );
    default:
      return (
        <Box
          as={RiCoinLine}
          height={iconHeight}
          marginRight="0.5rem"
          alignSelf="center"
          color="gray"
        />
      );
  }
};

export function amountToUnitString(currencyValue: CurrencyValue) {
  const amount = currencyValue.value;
  const { unit } = getCurrencyAndUnit(currencyValue);

  if (!amount) {
    return 'loading...';
  }

  switch (unit) {
    case CurrencyUnit.BTC:
    case CurrencyUnit.DAI:
    case CurrencyUnit.ETHER: {
      return amount.toString();
    }
    case CurrencyUnit.SATOSHI: {
      return toBitcoin(amount).toString();
    }
    case CurrencyUnit.WEI: {
      return formatEther(amount).toString();
    }
    case CurrencyUnit.ATTO: {
      return formatUnits(amount).toString();
    }
    default: {
      return amount.toString();
    }
  }
}

export default function CurrencyAmount({
  currencyValue,
  topText,
  subText1,
  subText2,
  amountFontSize,
  iconHeight,
  colourMode
}: CurrencyAmountProps) {
  // TODO: Properly use the decimals instead of using the internal unit
  const { currency } = getCurrencyAndUnit(currencyValue);
  const displayAmount = amountToUnitString(currencyValue);

  let displayNumberColor;
  let displayTextColor;

  if (colourMode) {
    switch (colourMode) {
      case ColorMode.GREEN:
        displayNumberColor = 'cyan.800';
        displayTextColor = 'cyan.600';
        break;
      case ColorMode.RED:
        displayNumberColor = 'orange.800';
        displayTextColor = 'orange.600';
        break;
      case ColorMode.WHITE:
        displayNumberColor = 'white';
        displayTextColor = 'white';
        break;
      default:
        break;
    }
  }

  const renderAmount = (
    <Flex direction="row">
      <Tooltip
        hasArrow
        aria-label={displayAmount}
        label={`${displayAmount} ${currency}`}
        placement="top"
      >
        <Flex direction="row" alignContent="center" minWidth="100px">
          {currencyIcon(currency, iconHeight)}
          {/* @ts-ignore */}
          <StatNumber
            color={displayNumberColor}
            fontSize={amountFontSize}
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
          >
            {displayAmount}
          </StatNumber>
        </Flex>
      </Tooltip>
    </Flex>
  );

  let renderTopText;
  let renderSubText1;
  let renderSubText2;

  if (topText) {
    // @ts-ignore
    renderTopText = (
      <StatLabel
        color={displayTextColor}
        minWidth="80px"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {topText}
      </StatLabel>
    );
  }

  if (subText1) {
    // @ts-ignore
    renderSubText1 = (
      <StatHelpText
        color={displayTextColor}
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {subText1}
      </StatHelpText>
    );
  }

  if (subText2) {
    // TODO: Fix the hacky minus margin
    // @ts-ignore
    renderSubText2 = (
      <StatHelpText
        color={displayTextColor}
        marginTop="-10px"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {subText2}
      </StatHelpText>
    );
  }

  return (
    <Stat>
      {renderTopText}
      {renderAmount}
      {renderSubText1}
      {renderSubText2}
    </Stat>
  );
}
