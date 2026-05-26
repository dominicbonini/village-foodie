export const BRANDS = {
  VILLAGE_FOODIE: {
    name: 'Village Foodie',
    domain: 'www.villagefoodie.co.uk',
    logo: '/logos/village-foodie-logo-v2.png',
    focus: 'consumer' as const,
  },
  HATCHGRAB: {
    name: 'HatchGrab',
    domain: 'www.hatchgrab.com',
    logo: '/logos/village-foodie-logo-v2.png', // temporary — replace when HatchGrab logo exists
    focus: 'operator' as const,
  },
} as const

export function getBrandFromHost(host: string) {
  if (host.includes('hatchgrab')) return BRANDS.HATCHGRAB
  return BRANDS.VILLAGE_FOODIE // default
}

export function isHatchGrabHost(host: string): boolean {
  return host.includes('hatchgrab')
}
