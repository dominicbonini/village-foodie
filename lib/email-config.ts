// Shared email sender configuration
// TODO: When hello@hatchgrab.com is set up in Brevo with SPF/DKIM, update
//       HATCHGRAB_SENDER.email to 'hello@hatchgrab.com'. Until then, emails
//       send from hello@villagefoodie.co.uk with "HatchGrab" as the display name.
//       Recipients see: HatchGrab <hello@villagefoodie.co.uk> — acceptable for trial.

// Operator-facing emails — HatchGrab brand
export const HATCHGRAB_SENDER = {
  name: 'HatchGrab',
  email: 'hello@villagefoodie.co.uk',
  replyTo: 'hello@villagefoodie.co.uk',
}

// Consumer-facing emails — Village Foodie brand
export const VILLAGE_FOODIE_SENDER = {
  name: 'Village Foodie',
  email: 'donotreply@villagefoodie.co.uk',
  replyTo: 'hello@villagefoodie.co.uk',
}

// Truck-branded emails (order confirmations to customers) — use the truck's own name
export function truckSender(truckName: string) {
  return {
    name: truckName,
    email: 'donotreply@villagefoodie.co.uk',
    replyTo: 'hello@villagefoodie.co.uk',
  }
}

// TODO: Add hatchgrab-logo.png to /public/logos/ once HatchGrab branding is finalised.
//       Until then, the HG logo URL will 404 in emails — update the value below.
export const HATCHGRAB_LOGO_URL =
  `${process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? 'https://www.hatchgrab.com'}/logos/hatchgrab-logo.png`

export const VF_LOGO_URL =
  `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://villagefoodie.co.uk'}/logos/village-foodie-logo-v2.png`
