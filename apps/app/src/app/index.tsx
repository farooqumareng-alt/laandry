import { Link, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { ServiceType } from '@laandry/domain';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Fonts } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

const STEPS = [
  { title: 'Schedule', body: 'Tell us what you need and when — takes about two minutes.' },
  { title: 'We pick it up', body: 'A vetted provider comes to your door in your chosen window.' },
  { title: 'We care for it', body: 'Washed, dried, folded or hung — exactly to your saved preferences.' },
  { title: 'Delivered back', body: 'Back at your door, ready to put away. No trip to the laundromat.' },
];

// Same labels/prices the booking wizard and pricing engine actually use —
// real numbers, not marketing copy invented for this page. Formal &
// Special Care and Bedding & Household are priced per item, but every
// order — however small — hits the $25 minimum, so that's the honest
// "starting at," not a single cheap item's unit price.
const SERVICES: { value: ServiceType; slug: string; label: string; description: string; startingAt: string }[] = [
  { value: 'EVERYDAY_LAUNDRY', slug: 'everyday-laundry', label: 'Everyday Laundry', description: 'Wash, dry, fold — priced by weight.', startingAt: 'From $35' },
  { value: 'FORMAL_SPECIAL_CARE', slug: 'garment-care', label: 'Formal & Special Care', description: 'Priced per item — the care dry-clean-only pieces need.', startingAt: 'From $25' },
  { value: 'BEDDING_HOUSEHOLD', slug: 'household', label: 'Bedding & Household', description: 'Sheets, towels, comforters, and more.', startingAt: 'From $25' },
  { value: 'TRAVEL', slug: 'travel', label: 'Laandry for Travelers', description: 'Hotel and short-stay pickup, priced by weight.', startingAt: 'From $35' },
];

function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text style={{ color: theme.brass, fontFamily: Fonts?.mono, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
      {children}
    </Text>
  );
}

function HowItWorksStep({ number, title, body }: { number: number; title: string; body: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        }}
      >
        <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>{number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '600', marginBottom: 2 }}>{title}</Text>
        <Text style={{ color: theme.inkSoft, fontSize: 14, lineHeight: 20 }}>{body}</Text>
      </View>
    </View>
  );
}

function ServiceCard({ service }: { service: (typeof SERVICES)[number] }) {
  const theme = useTheme();
  return (
    <Link href={{ pathname: '/services/[slug]', params: { slug: service.slug } }} asChild>
      <Pressable
        style={{
          flexGrow: 1,
          flexBasis: 260,
          borderWidth: 1,
          borderColor: theme.line,
          borderRadius: 12,
          padding: 16,
          backgroundColor: theme.paperRaised,
          gap: 4,
        }}
      >
        <Text style={{ color: theme.ink, fontSize: 15.5, fontWeight: '600' }}>{service.label}</Text>
        <Text style={{ color: theme.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{service.description}</Text>
        <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600', marginTop: 8 }}>{service.startingAt}</Text>
      </Pressable>
    </Link>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const { status } = useAuth();

  return (
    <Screen
      kicker="Public · laandry.com"
      title="Get your time back."
      description="Laundry picked up from your door and returned clean, fresh, and exactly the way you like it. Wash. Dry. Fold. Hang. Press. You choose what you need — we take care of the rest."
    >
      <Link href="/book" asChild>
        <Pressable style={{ backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 24, marginTop: 24, alignSelf: 'flex-start' }}>
          <Text style={{ color: theme.accentInk, fontFamily: Fonts?.body, fontWeight: '600', fontSize: 16 }}>
            Schedule My Pickup
          </Text>
        </Pressable>
      </Link>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
        {status === 'signedIn' ? (
          <Link href="/account">
            <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Go to my account</Text>
          </Link>
        ) : (
          <>
            <Text style={{ color: theme.inkSoft, fontSize: 14 }}>Already use Laandry?</Text>
            <Link href="/login">
              <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>Sign in</Text>
            </Link>
          </>
        )}
      </View>

      <View style={{ marginTop: 56 }}>
        <SectionLabel>How it works</SectionLabel>
        <View style={{ gap: 20 }}>
          {STEPS.map((step, i) => (
            <HowItWorksStep key={step.title} number={i + 1} title={step.title} body={step.body} />
          ))}
        </View>
        <View style={{ marginTop: 20 }}>
          <Link href="/how-it-works">
            <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 14 }}>See the full walkthrough →</Text>
          </Link>
        </View>
      </View>

      <View style={{ marginTop: 56 }}>
        <SectionLabel>What can we take off your hands?</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {SERVICES.map((service) => (
            <ServiceCard key={service.value} service={service} />
          ))}
        </View>
      </View>

      <View style={{ marginTop: 56, paddingTop: 32, borderTopWidth: 1, borderTopColor: theme.line, gap: 12 }}>
        <SectionLabel>For providers</SectionLabel>
        <Text style={{ color: theme.ink, fontSize: 19, fontWeight: '600' }}>Earn on your own schedule.</Text>
        <Text style={{ color: theme.inkSoft, fontSize: 14, lineHeight: 20, marginBottom: 4 }}>
          Set your availability, receive eligible orders in your service area, and build the kind of service record
          customers rebook.
        </Text>
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label="Become a Provider" variant="secondary" onPress={() => router.push('/providers')} />
        </View>
      </View>
    </Screen>
  );
}
