import type { CountryCode } from './types.ts';

/**
 * Demo conversations used by both `server/seed.ts` (SQLite) and the offline
 * browser mock (`src/lib/mock-backend.ts`). Keeping one list means the two
 * modes show the same history.
 */
export interface DemoConversationSeed {
  id: string;
  message: string;
  market: CountryCode;
  /** Hours before "now"; larger means older. */
  hoursAgo: number;
}

export const DEMO_CONVERSATIONS: DemoConversationSeed[] = [
  {
    id: 'demo-sony-malaysia',
    message: 'Sony WH-1000XM5 在马来西亚哪里买最便宜？',
    market: 'MY',
    hoursAgo: 2.2,
  },
  {
    id: 'demo-iphone-thailand',
    message: '泰国 iPhone 15 128G 现在到手价多少？',
    market: 'TH',
    hoursAgo: 26,
  },
  {
    id: 'demo-airpods-indonesia',
    message: '印尼买 AirPods Pro 2 划算吗？',
    market: 'ID',
    hoursAgo: 31,
  },
  {
    id: 'demo-nb-philippines',
    message: '菲律宾 New Balance 530 多少钱？',
    market: 'PH',
    hoursAgo: 53,
  },
  {
    id: 'demo-skii-singapore',
    message: '新加坡的 SK-II 神仙水 230ml，哪家更划算？',
    market: 'SG',
    hoursAgo: 75,
  },
  {
    id: 'demo-airfryer-vietnam',
    message: '越南小米空气炸锅 6L 最近降价了吗？',
    market: 'VN',
    hoursAgo: 121,
  },
  {
    id: 'demo-gift-singapore',
    message: '第一次去新加坡，有什么值得买的伴手礼？',
    market: 'SG',
    hoursAgo: 146,
  },
  {
    id: 'demo-watch-bangkok',
    message: '曼谷的 Apple Watch SE 2 和 Garmin 265 哪个更值？',
    market: 'TH',
    hoursAgo: 171,
  },
];
