import type { Kit } from './schema.js';

/**
 * 内置村落套件。与 kits/village-euro.json 保持一致（有测试比对），
 * 这样运行时（CLI / Studio）不必依赖仓库里的文件路径。
 */
export const villageEuroKit: Kit = {
  id: 'village-euro',
  name: '欧式村落基础套件',
  style: 'medieval-european',
  palette: {
    ground: '#d9d2bf',
    road: '#b3a68d',
    plaza: '#cdc3a8',
    water: '#8fb8cc',
    green: '#a8c08a',
  },
  prefabs: [
    {
      id: 'house-small',
      role: 'house',
      footprint: { minWidth: 5, maxWidth: 7, minHeight: 5, maxHeight: 6 },
      weight: 5,
      color: '#d9a15b',
      roof: 'gable',
      mainRoad: false,
    },
    {
      id: 'house-long',
      role: 'house',
      footprint: { minWidth: 8, maxWidth: 11, minHeight: 5, maxHeight: 6 },
      weight: 2,
      color: '#c98f4f',
      roof: 'hip',
      mainRoad: false,
    },
    {
      id: 'smithy',
      role: 'workshop',
      footprint: { minWidth: 6, maxWidth: 8, minHeight: 6, maxHeight: 7 },
      weight: 1,
      color: '#8f6b4a',
      roof: 'gable',
      mainRoad: false,
    },
    {
      id: 'tavern',
      role: 'shop',
      footprint: { minWidth: 8, maxWidth: 10, minHeight: 6, maxHeight: 8 },
      weight: 1.5,
      color: '#b5793f',
      roof: 'hip',
      mainRoad: false,
    },
    {
      id: 'chapel',
      role: 'civic',
      footprint: { minWidth: 9, maxWidth: 12, minHeight: 10, maxHeight: 12 },
      weight: 1,
      color: '#cbbfae',
      roof: 'gable',
      mainRoad: true,
    },
    {
      id: 'market-hall',
      role: 'civic',
      footprint: { minWidth: 10, maxWidth: 13, minHeight: 7, maxHeight: 9 },
      weight: 0.8,
      color: '#b99b6b',
      roof: 'flat',
      mainRoad: true,
    },
    {
      id: 'dock-house',
      role: 'dock',
      footprint: { minWidth: 6, maxWidth: 8, minHeight: 5, maxHeight: 6 },
      weight: 0.6,
      color: '#8b7355',
      roof: 'flat',
      mainRoad: false,
    },
  ],
};

export const builtinKits: Kit[] = [villageEuroKit];

export function findBuiltinKit(id: string): Kit | undefined {
  return builtinKits.find((kit) => kit.id === id);
}
