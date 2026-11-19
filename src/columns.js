// Definice sloupců tabulek. type: text | money | date | select | bool
export const PLATBA = [
  { value: 'prevod', label: 'převod' },
  { value: 'hotove', label: 'hotově' },
  { value: 'karta', label: 'karta' },
  { value: 'jine', label: 'jiné' },
]

export const VYDAJE_COLS = [
  { key: 'datum', label: 'Datum', type: 'date', required: true },
  { key: 'prijemce', label: 'Příjemce', type: 'text' },
  { key: 'popis', label: 'Popis', type: 'text', required: true, wide: true },
  { key: 'kategorie', label: 'Kategorie', type: 'text' },
  { key: 'castka', label: 'Částka', type: 'money', required: true },
  { key: 'mena', label: 'Měna', type: 'text', default: 'CZK' },
  {
    key: 'rezim', label: 'Režim', type: 'select', default: 'oficialne',
    options: [{ value: 'oficialne', label: 'oficiálně' }, { value: 'bokem', label: 'bokem' }],
  },
  { key: 'zpusob_platby', label: 'Platba', type: 'select', options: PLATBA, nullable: true },
  { key: 'doklad', label: 'Doklad', type: 'text' },
  { key: 'zaplatil', label: 'Zaplatil', type: 'text', default: 'Iva' },
  { key: 'splatnost', label: 'Splatnost', type: 'date' },
  { key: 'zaplaceno', label: 'Zaplaceno', type: 'bool', default: true },
  { key: 'poznamka', label: 'Poznámka', type: 'text', wide: true },
]

export const JZ_COLS = [
  { key: 'datum', label: 'Datum', type: 'date', required: true },
  {
    key: 'smer', label: 'Směr', type: 'select', default: 'prijem',
    options: [{ value: 'prijem', label: 'Jitka → Iva' }, { value: 'vydej', label: 'Iva → Jitka' }],
  },
  { key: 'popis', label: 'Popis', type: 'text', required: true, wide: true },
  { key: 'castka', label: 'Částka', type: 'money', required: true, positive: true },
  { key: 'mena', label: 'Měna', type: 'text', default: 'CZK' },
  { key: 'zpusob_platby', label: 'Platba', type: 'select', options: PLATBA, nullable: true },
  { key: 'poznamka', label: 'Poznámka', type: 'text', wide: true },
]

export const UKOLY_COLS = [
  { key: 'nazev', label: 'Úkol', type: 'text', required: true, wide: true },
  { key: 'odpovedny', label: 'Kdo', type: 'text', default: 'Iva' },
  { key: 'termin', label: 'Termín', type: 'date' },
  {
    key: 'stav', label: 'Stav', type: 'select', default: 'otevreny',
    options: [
      { value: 'otevreny', label: 'otevřený' },
      { value: 'rozpracovany', label: 'rozpracovaný' },
      { value: 'hotovo', label: 'hotovo' },
    ],
  },
  { key: 'hotovo_dne', label: 'Hotovo dne', type: 'date' },
  { key: 'popis', label: 'Popis', type: 'text', wide: true },
  { key: 'odkaz', label: 'Odkaz', type: 'text', link: true },
  { key: 'poznamka', label: 'Poznámka', type: 'text', wide: true },
]
