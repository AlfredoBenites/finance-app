// Icon + color choices for buckets. Buckets store an `icon` key and `color` key
// (both optional); this module maps them to lucide components and hex colors and
// renders them. Keys are stored in the DB so keep them stable.
import {
  PiggyBank,
  Gift,
  User,
  Users,
  CreditCard,
  Fuel,
  Car,
  Dumbbell,
  CalendarDays,
  Plane,
  House,
  ShoppingCart,
  HeartPulse,
  GraduationCap,
  Utensils,
  Shield,
  Wallet,
  Landmark,
  Shirt,
  Wrench,
} from "lucide-react";
import { cn } from "../ui";

// [key, label, Icon] — key is what we persist.
export const BUCKET_ICONS = [
  ["piggy-bank", "Savings", PiggyBank],
  ["gift", "Gift", Gift],
  ["user", "Person", User],
  ["users", "People", Users],
  ["credit-card", "Credit card", CreditCard],
  ["fuel", "Gas", Fuel],
  ["car", "Car", Car],
  ["dumbbell", "Gym / health", Dumbbell],
  ["calendar", "Taxes / dates", CalendarDays],
  ["plane", "Travel", Plane],
  ["house", "Home / rent", House],
  ["cart", "Groceries", ShoppingCart],
  ["health", "Health", HeartPulse],
  ["school", "School", GraduationCap],
  ["food", "Food", Utensils],
  ["shield", "Insurance", Shield],
  ["wallet", "General", Wallet],
  ["landmark", "Bills", Landmark],
  ["shirt", "Clothes", Shirt],
  ["wrench", "Repairs", Wrench],
];

const ICON_BY_KEY = Object.fromEntries(BUCKET_ICONS.map(([key, , Icon]) => [key, Icon]));

// [key, label, hex]. Hex is applied inline (dynamic colors can't be Tailwind classes).
export const BUCKET_COLORS = [
  ["slate", "Slate", "#64748b"],
  ["red", "Red", "#ef4444"],
  ["orange", "Orange", "#f97316"],
  ["amber", "Amber", "#f59e0b"],
  ["green", "Green", "#22c55e"],
  ["teal", "Teal", "#14b8a6"],
  ["blue", "Blue", "#3b82f6"],
  ["indigo", "Indigo", "#6366f1"],
  ["violet", "Violet", "#8b5cf6"],
  ["pink", "Pink", "#ec4899"],
];

const COLOR_BY_KEY = Object.fromEntries(BUCKET_COLORS.map(([key, , hex]) => [key, hex]));

export const colorHex = (key) => COLOR_BY_KEY[key];

// Render a bucket's icon in its color. Falls back to a wallet icon and the muted
// text color when nothing is chosen. `credit_card_id` buckets default to a card.
export function BucketIcon({ icon, color, size = 16, className }) {
  const Icon = ICON_BY_KEY[icon] || Wallet;
  const hex = COLOR_BY_KEY[color];
  // With no chosen color the icon inherits `text-muted` (currentColor); a chosen
  // color overrides via lucide's `color` prop.
  return <Icon size={size} className={cn(!hex && "text-muted", className)} color={hex || undefined} />;
}
