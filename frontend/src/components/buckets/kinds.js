// How a bucket's money flows into net worth / real available money. `label` is
// Title Case with a chevron separator; used in tags and the kind picker.
export const KINDS = [
  { value: "spendable", label: "Mine › Spendable", hint: "counts in net worth AND real available money" },
  { value: "set_aside", label: "Mine › Set Aside", hint: "counts in net worth, NOT in real available money" },
  { value: "not_mine", label: "Not Mine › Holding", hint: "excluded from net worth AND real available money" },
];

export const kindLabel = (k) => (KINDS.find((x) => x.value === k) || KINDS[1]).label;
