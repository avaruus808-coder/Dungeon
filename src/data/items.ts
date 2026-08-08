export type ItemCategory = 'weapon' | 'artifact' | 'consumable' | 'quest';

export type ItemDefinition = {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  glyph: string;
  maxStack: number;
};

export const ITEMS = {
  bloodCrystal: {
    id: 'blood-crystal',
    name: 'Verikristalli',
    category: 'consumable',
    description: 'Lämmin kristalli sykkii samaan tahtiin kantajansa sydämen kanssa. Palauttaa myöhemmin käytettäessä elinvoimaa ja tyhjiövoimaa.',
    glyph: '◆',
    maxStack: 3,
  },
  rustedBlade: {
    id: 'rusted-blade',
    name: 'Ruostunut terä',
    category: 'weapon',
    description: 'Vanha rautaterä. Ruosteesta huolimatta sen paino tuntuu kädessä tutulta.',
    glyph: '†',
    maxStack: 1,
  },
  sealedFragment: {
    id: 'sealed-fragment',
    name: 'Sinetöity sirpale',
    category: 'artifact',
    description: 'Musta kappale, jonka pinnalla valo kulkee väärään suuntaan. Sen käyttötarkoitus ei ole vielä tiedossa.',
    glyph: '◇',
    maxStack: 1,
  },
} satisfies Record<string, ItemDefinition>;

export const ITEM_BY_ID: Readonly<Record<string, ItemDefinition>> = Object.fromEntries(
  Object.values(ITEMS).map((item) => [item.id, item]),
);
