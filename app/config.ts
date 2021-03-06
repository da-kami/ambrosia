import os from 'os';
import fs from 'fs';
import dotenv from 'dotenv';
import { createContext, useContext } from 'react';
import { Role } from './utils/swap';

export interface Config {
  LEDGER_BITCOIN_ACCOUNT_INDEX: number;
  LEDGER_ETHEREUM_ACCOUNT_INDEX: number;
  LEDGER_ETHEREUM_ACCOUNT_ADDRESS: string;
  BITCOIND_ENDPOINT: string;
  WEB3_ENDPOINT: string;
  CND_URL: string;
  SETUP_COMPLETE: boolean;
  ROLE: Role;
}

const ENV_PATH = `${os.homedir()}/.create-comit-app/env`;

export function fromComitEnv(): Config | null {
  if (!fs.existsSync(ENV_PATH)) {
    return null;
  }

  const comitEnv = dotenv.parse(fs.readFileSync(ENV_PATH));

  const bitcoindHttpUri = new URL(comitEnv.BITCOIN_HTTP_URI);

  let role;
  switch (process.env.ROLE) {
    case Role.ALICE:
      role = Role.ALICE;
      break;
    case Role.BOB:
      role = Role.BOB;
      break;
    default:
      role = Role.ALICE;
      break;
  }

  return {
    BITCOIND_ENDPOINT: `http://${comitEnv.BITCOIN_USERNAME}:${comitEnv.BITCOIN_PASSWORD}@${bitcoindHttpUri.host}`,
    WEB3_ENDPOINT: comitEnv.ETHEREUM_NODE_HTTP_URL,
    LEDGER_BITCOIN_ACCOUNT_INDEX: role === Role.ALICE ? 0 : 1,
    LEDGER_ETHEREUM_ACCOUNT_INDEX: role === Role.ALICE ? 0 : 1,
    LEDGER_ETHEREUM_ACCOUNT_ADDRESS:
      role === Role.ALICE
        ? '0x5087fb5F19f8EF0585b4EFcb3375De97C9d0fE0e'
        : '0xeD56BBA7d30FEb908aB7a5a7b3b16654cb45a38C',
    CND_URL:
      role === Role.ALICE ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:8100',
    SETUP_COMPLETE: true,
    ROLE: role
  };
}

const CONFIG_CONTEXT = createContext(null);

export const Provider = CONFIG_CONTEXT.Provider;

export function useConfig(): Config {
  return useContext(CONFIG_CONTEXT);
}
