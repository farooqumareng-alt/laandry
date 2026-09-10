import { Screen } from '@/components/screen';

export default function PrivacyScreen() {
  return (
    <Screen
      kicker="Public · laandry.com"
      title="Your laundry. Your privacy."
      description="Plain-language privacy explainer — matches the handling rules in docs/ARCHITECTURE.md §6 and §11: masked contact info, address reveal timing, and private photo storage."
    />
  );
}
