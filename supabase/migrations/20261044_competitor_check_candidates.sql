-- supabase/migrations/20261044_competitor_check_candidates.sql — competitor-check-1 (25 October 2026): 70 CANDIDATE
-- competitors from docs/competition-check-1/gemini-deep-research.csv (preorder_tools_found), plus Gustoco, leafsystems and
-- DISH's food-truck page for DE. ⛔ NOT RUN — run AFTER 20261043 (it needs lifecycle, added_as_candidate and check_urls).
-- The list and what was left out (marketplaces, app-store-only listings, generic pages, tools already known) is in
-- data/competitor-check-1/candidates.json. A candidate is never counted or shown in Pricing check until its
-- classification is accepted (Automatic checks) and it is verified.
-- 🔴 Dedupe again at run time: a row is skipped when a competitor with the same name (any case) or the same domain exists.

insert into public.competitors (name, website, lifecycle, added_as_candidate, check_urls, notes)
select v.name, v.website, 'candidate', true, v.urls, v.note
from (values
  ('Square', 'https://squareup.com', 'squareup.com', array['https://squareup.com/gb/en/solutions/food-truck']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: GB'),
  ('Epos Now', 'https://www.eposnow.com', 'eposnow.com', array['https://www.eposnow.com/uk/systems/hospitality-pos/food-truck/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: GB'),
  ('XPRIO', 'https://xprio.com', 'xprio.com', array['https://xprio.com/en/food-truck-app/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: GB, NZ, MT'),
  ('TapaPOS', 'https://tapapay.app', 'tapapay.app', array['https://tapapay.app/food-truck-epos']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: IE'),
  ('Flash Order', 'https://flashordr.com', 'flashordr.com', array['https://flashordr.com/food-truck-ordering-system/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: US'),
  ('INFI', 'https://infi.us', 'infi.us', array['https://infi.us/food-trucks']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: US'),
  ('RestApp', 'https://www.restapp.com', 'restapp.com', array['https://www.restapp.com/business-types/online-ordering-for-food-trucks/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: US'),
  ('Menuthere', 'https://menuthere.com', 'menuthere.com', array['https://menuthere.com/en/solutions/food-trucks', 'https://menuthere.com/de/shopify-for-food-trucks']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: US, DE'),
  ('Regulars', 'https://tryregulars.com', 'tryregulars.com', array['https://tryregulars.com/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: US'),
  ('Order Local', 'https://getorderlocal.com', 'getorderlocal.com', array['https://getorderlocal.com/for-food-trucks']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CA'),
  ('Preorder', 'https://order-pre.com', 'order-pre.com', array['https://order-pre.com/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CA'),
  ('CloudOrders', 'https://cloudorders.co', 'cloudorders.co', array['https://cloudorders.co/food-trucks']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CA'),
  ('iShopo', 'https://ishopo.ca', 'ishopo.ca', array['https://ishopo.ca/food-truck-ordering-system/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CA'),
  ('Dine360', 'https://dine360.ca', 'dine360.ca', array['https://dine360.ca/restaurant-types/food-truck/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CA'),
  ('Feadys', 'https://feadys.com', 'feadys.com', array['https://feadys.com/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CA, CH'),
  ('Y wait', 'https://ywait.com.au', 'ywait.com.au', array['https://ywait.com.au/business-types/food-trucks/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: AU'),
  ('Wollopit', 'https://wollopit.com.au', 'wollopit.com.au', array['https://wollopit.com.au/for/food-trucks/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: AU'),
  ('Asky', 'https://asky.ai', 'asky.ai', array['https://asky.ai/au/food-trucks/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: AU'),
  ('MetaPOS', 'https://metapos.com.au', 'metapos.com.au', array['https://metapos.com.au/food-truck.php']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: AU'),
  ('SmakSpace', 'https://smakspace.co.nz', 'smakspace.co.nz', array['https://smakspace.co.nz/solutions/food-trucks']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: NZ'),
  ('CliqMenu', 'https://cliqmenu.com', 'cliqmenu.com', array['https://cliqmenu.com/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: NZ'),
  ('FoodChow', 'https://www.foodchow.com', 'foodchow.com', array['https://www.foodchow.com/en/Gibraltar']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: GI'),
  ('Gustoco', 'https://www.gustoco.de', 'gustoco.de', array['https://www.gustoco.de/food-truck-bestellsystem/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: DE'),
  ('leafsystems', 'https://leaf-systems.eu', 'leaf-systems.eu', array['https://leaf-systems.eu/kassenloesung-fuer-foodtrucks/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: DE, AT'),
  ('DISH', 'https://www.dish.co', 'dish.co', array['https://www.dish.co/DE/de/foodtruck-und-foodstand/', 'https://www.dish.co/NL/nl/selfservice/bestelsite/', 'https://www.dish.co/ES/es/dish-professional-order/', 'https://www.dish.co/IT/it/snack-bar-e-ristorante-fast-food/', 'https://www.dish.co/SK/sk/food-truck-a-st%C3%A1nok/', 'https://www.dish.co/HU/hu/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: DE, NL, ES, IT, SK, HU'),
  ('Ordero', 'https://ordero.ch', 'ordero.ch', array['https://ordero.ch/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CH'),
  ('Rent-a-Shop', 'https://www.rent-a-shop.ch', 'rent-a-shop.ch', array['https://www.rent-a-shop.ch/foodtruck-kassensystem']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CH'),
  ('SwissPOS', 'https://www.swisspos.ch', 'swisspos.ch', array['https://www.swisspos.ch/kassensystem/foodtruck-events']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CH'),
  ('EatSelf', 'https://www.eatself.com', 'eatself.com', array['https://www.eatself.com/essai-gratuit/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CH, LU'),
  ('Restomax', 'https://www.restomax.be', 'restomax.be', array['https://www.restomax.be/fastfood-click-collect']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: BE'),
  ('Fritzy', 'https://fritzy.be', 'fritzy.be', array['https://fritzy.be/le-jour-des-frites']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: BE'),
  ('DigiCommerce', 'https://stage.app.digicommerce.be', 'stage.app.digicommerce.be', array['https://stage.app.digicommerce.be/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: BE'),
  ('Menuella', 'https://www.menuella.com', 'menuella.com', array['https://www.menuella.com/nl/voor/foodtruck', 'https://www.menuella.com/fr/pour/food-truck', 'https://www.menuella.com/es/guides/restaurant-online-ordering', 'https://www.menuella.com/fi/for/food-trucks', 'https://www.menuella.com/hr/for/food-trucks']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: NL, FR, ES, FI, HR'),
  ('ExtendaGO Ordin', 'https://www.extendago.com', 'extendago.com', array['https://www.extendago.com/nl/add-ons/go-ordin/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: NL'),
  ('iButler', 'https://www.i-butler.nl', 'i-butler.nl', array['https://www.i-butler.nl/producten/afhalen-bezorgen/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: NL'),
  ('Bistriqx', 'https://bistriqx.com', 'bistriqx.com', array['https://bistriqx.com/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: NL'),
  ('bonappli', 'https://bonappli.fr', 'bonappli.fr', array['https://bonappli.fr/solutions/food-truck']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: FR'),
  ('Vroomeat', 'https://vroomeat.fr', 'vroomeat.fr', array['https://vroomeat.fr/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: FR'),
  ('Food Truck Concept', 'https://foodtruck-concept.com', 'foodtruck-concept.com', array['https://foodtruck-concept.com/assistance-marketing-food-truck']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: FR'),
  ('LivePepper', 'https://www.livepepper.fr', 'livepepper.fr', array['https://www.livepepper.fr/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: FR'),
  ('L''Addition', 'https://commande-en-ligne.laddition.com', 'commande-en-ligne.laddition.com', array['https://commande-en-ligne.laddition.com/commande-en-ligne/foodtruck-baostreet']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: FR'),
  ('Ounti', 'https://ounti.com', 'ounti.com', array['https://ounti.com/es/website-for-food-trucks']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: ES'),
  ('Foodlz', 'https://foodlz.io', 'foodlz.io', array['https://foodlz.io/pt']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PT'),
  ('Waiterio', 'https://www.waiterio.com', 'waiterio.com', array['https://www.waiterio.com/pt/software-para-food-truck/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PT'),
  ('Tilby', 'https://tilby.com', 'tilby.com', array['http://tilby.com/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: IT'),
  ('NewPOS', 'https://www.newpos.ai', 'newpos.ai', array['https://www.newpos.ai/it/l/gastronomie/foodtruck', 'https://www.newpos.ai/pl/l/gastronomia/foodtruck']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: IT, PL'),
  ('MenuForma', 'https://menuforma.com', 'menuforma.com', array['https://menuforma.com/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: IT, SK, RO'),
  ('Software Food Good', 'https://boomsrl.it', 'boomsrl.it', array['https://boomsrl.it/sistema-ordini-online-per-ristoranti/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: IT'),
  ('Zegashop', 'https://www.zegashop.com', 'zegashop.com', array['https://www.zegashop.com/business/how-to-create-an-online-ordering-website-for-food-trucks-in-greece/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: GR'),
  ('Taptouch POS', 'https://taptouchpos.com', 'taptouchpos.com', array['https://taptouchpos.com/nl/hospitality/online-ordering/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CY'),
  ('Sapaad', 'https://www.sapaad.com', 'sapaad.com', array['https://www.sapaad.com/pos-for-food-trucks/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: CY'),
  ('Creavo Order', 'https://creavo.fi', 'creavo.fi', array['https://creavo.fi/brandipaketti']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: FI'),
  ('Ordeliya', 'https://ordeliya.com', 'ordeliya.com', array['https://ordeliya.com/et']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: EE'),
  ('GoPOS / GoOrder', 'https://gopos.pl', 'gopos.pl', array['https://gopos.pl/foodtruck']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PL'),
  ('POSbistro', 'https://posbistro.com', 'posbistro.com', array['https://posbistro.com/typ-biznesu/oprogramowanie-dla-food-trucka/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PL'),
  ('apetitio', 'https://apetitio.pl', 'apetitio.pl', array['https://apetitio.pl/biznes/foodtrucki']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PL'),
  ('restauracja.online', 'https://restauracja.online', 'restauracja.online', array['https://restauracja.online/oferta/ogrodki-restauracji-food-trucki-samoobsluga-w-restauracji']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PL'),
  ('ord.to', 'https://ord.to', 'ord.to', array['https://ord.to/pl/designed-for-foodtrucks']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PL'),
  ('ABS POS', 'https://abspos.pl', 'abspos.pl', array['https://abspos.pl/oprogramowanie-dla-kebab-food-truck/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PL'),
  ('Foodeliver', 'https://4bsystems.pl', '4bsystems.pl', array['https://4bsystems.pl/uslugi-saas-dla-biznesu/foodelier-system-zamowien-online-dla-gastronomii/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PL'),
  ('Restaumatic', 'https://www.restaumatic.com', 'restaumatic.com', array['https://www.restaumatic.com/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: PL, SK, RO, HR'),
  ('4SaleFood', 'https://4salefood.net', '4salefood.net', array['https://4salefood.net/sk']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: SK'),
  ('Orderly', 'https://orderly.hu', 'orderly.hu', array['https://orderly.hu/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: HU'),
  ('StandMágus / OnlineMágus', 'https://www.vendeglato-szoftver.hu', 'vendeglato-szoftver.hu', array['https://www.vendeglato-szoftver.hu/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: HU'),
  ('eSystem', 'https://vendeglatoprogram.com', 'vendeglatoprogram.com', array['https://vendeglatoprogram.com/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: HU'),
  ('QRM.hu', 'https://qrm.hu', 'qrm.hu', array['https://qrm.hu/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: HU'),
  ('Happy Gastro', 'https://www.happygastro.hu', 'happygastro.hu', array['https://www.happygastro.hu/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: HU'),
  ('Orsys', 'https://www.orsys.hu', 'orsys.hu', array['https://www.orsys.hu/en']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: HU'),
  ('Appy POS', 'https://appy.ro', 'appy.ro', array['https://appy.ro/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: RO'),
  ('TapTasty', 'https://www.taptasty.com', 'taptasty.com', array['https://www.taptasty.com/ro/preturi/']::text[], 'competitor-check-1 candidate · gemini-deep-research.csv · countries: RO')
) as v(name, website, domain, urls, note)
where not exists (
  select 1 from public.competitors c
  where lower(btrim(c.name)) = lower(btrim(v.name))
     or regexp_replace(lower(coalesce(c.website, '')), '^https?://(www\.)?([^/:]+).*$', '\2') = v.domain
);

-- Check: select count(*) from public.competitors where lifecycle = 'candidate';   -- 70 on a database with no duplicates
