// Every country a passport stamp can be for. One line each: ISO code | name | aliases (comma separated).
// People type a few letters and pick from the matches; aliases like "USA" or "Ivory Coast" are searched too.
const RAW = `AF|Afghanistan
AL|Albania
DZ|Algeria
AD|Andorra
AO|Angola
AG|Antigua and Barbuda
AR|Argentina
AM|Armenia
AU|Australia
AT|Austria
AZ|Azerbaijan
BS|Bahamas
BH|Bahrain
BD|Bangladesh
BB|Barbados
BY|Belarus
BE|Belgium
BZ|Belize
BJ|Benin
BT|Bhutan
BO|Bolivia
BA|Bosnia and Herzegovina
BW|Botswana
BR|Brazil
BN|Brunei
BG|Bulgaria
BF|Burkina Faso
BI|Burundi
CV|Cabo Verde|Cape Verde
KH|Cambodia
CM|Cameroon
CA|Canada
CF|Central African Republic
TD|Chad
CL|Chile
CN|China
CO|Colombia
KM|Comoros
CG|Congo (Republic)|Congo-Brazzaville,Republic of the Congo
CD|Congo (DR)|DRC,Democratic Republic of the Congo,Zaire,Congo-Kinshasa
CR|Costa Rica
CI|Côte d'Ivoire|Ivory Coast
HR|Croatia
CU|Cuba
CY|Cyprus
CZ|Czechia|Czech Republic
DK|Denmark
DJ|Djibouti
DM|Dominica
DO|Dominican Republic
EC|Ecuador
EG|Egypt
SV|El Salvador
GQ|Equatorial Guinea
ER|Eritrea
EE|Estonia
SZ|Eswatini|Swaziland
ET|Ethiopia
FJ|Fiji
FI|Finland
FR|France
GA|Gabon
GM|Gambia
GE|Georgia
DE|Germany
GH|Ghana
GR|Greece
GD|Grenada
GT|Guatemala
GN|Guinea
GW|Guinea-Bissau
GY|Guyana
HT|Haiti
HN|Honduras
HK|Hong Kong
HU|Hungary
IS|Iceland
IN|India
ID|Indonesia
IR|Iran|Persia
IQ|Iraq
IE|Ireland
IL|Israel
IT|Italy
JM|Jamaica
JP|Japan
JO|Jordan
KZ|Kazakhstan
KE|Kenya
KI|Kiribati
XK|Kosovo
KW|Kuwait
KG|Kyrgyzstan
LA|Laos
LV|Latvia
LB|Lebanon
LS|Lesotho
LR|Liberia
LY|Libya
LI|Liechtenstein
LT|Lithuania
LU|Luxembourg
MO|Macao|Macau
MG|Madagascar
MW|Malawi
MY|Malaysia
MV|Maldives
ML|Mali
MT|Malta
MH|Marshall Islands
MR|Mauritania
MU|Mauritius
MX|Mexico
FM|Micronesia
MD|Moldova
MC|Monaco
MN|Mongolia
ME|Montenegro
MA|Morocco
MZ|Mozambique
MM|Myanmar|Burma
NA|Namibia
NR|Nauru
NP|Nepal
NL|Netherlands|Holland
NZ|New Zealand
NI|Nicaragua
NE|Niger
NG|Nigeria
KP|North Korea
MK|North Macedonia|Macedonia
NO|Norway
OM|Oman
PK|Pakistan
PW|Palau
PS|Palestine|Gaza,West Bank
PA|Panama
PG|Papua New Guinea
PY|Paraguay
PE|Peru
PH|Philippines
PL|Poland
PT|Portugal
PR|Puerto Rico
QA|Qatar
RO|Romania
RU|Russia
RW|Rwanda
KN|Saint Kitts and Nevis
LC|Saint Lucia
VC|Saint Vincent and the Grenadines
WS|Samoa
SM|San Marino
ST|São Tomé and Príncipe|Sao Tome
SA|Saudi Arabia
SN|Senegal
RS|Serbia
SC|Seychelles
SL|Sierra Leone
SG|Singapore
SK|Slovakia
SI|Slovenia
SB|Solomon Islands
SO|Somalia
ZA|South Africa
KR|South Korea
SS|South Sudan
ES|Spain
LK|Sri Lanka
SD|Sudan
SR|Suriname
SE|Sweden
CH|Switzerland
SY|Syria
TW|Taiwan
TJ|Tajikistan
TZ|Tanzania
TH|Thailand
TL|Timor-Leste|East Timor
TG|Togo
TO|Tonga
TT|Trinidad and Tobago
TN|Tunisia
TR|Türkiye|Turkey
TM|Turkmenistan
TV|Tuvalu
UG|Uganda
UA|Ukraine
AE|United Arab Emirates|UAE,Emirates
GB|United Kingdom|UK,England,Scotland,Wales,Britain,Great Britain,Northern Ireland
US|United States|USA,America,United States of America,US
UY|Uruguay
UZ|Uzbekistan
VU|Vanuatu
VA|Vatican City|Vatican,Holy See
VE|Venezuela
VN|Vietnam
YE|Yemen
ZM|Zambia
ZW|Zimbabwe`;

export const COUNTRIES = RAW.split('\n').map((line) => {
  const [code, name, aliases = ''] = line.split('|');
  return { code, name, aliases: aliases ? aliases.split(',') : [] };
});

const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const INDEX = COUNTRIES.map((c) => ({ c, terms: [c.name, ...c.aliases].map(plain) }));

export const flag = (code) => [...code].map((ch) => String.fromCodePoint(127397 + ch.charCodeAt(0))).join('');

// The country whose name or alias is exactly this text, or null.
export function findCountry(text) {
  const t = plain(text || '');
  if (!t) return null;
  return INDEX.find((x) => x.terms.includes(t))?.c ?? null;
}

// Up to `max` countries matching what was typed: names that start with it first, then any word that starts with it.
export function searchCountries(text, max = 8) {
  const t = plain(text || '');
  if (!t) return [];
  const scored = [];
  for (const { c, terms } of INDEX) {
    let best = 9;
    for (const term of terms) {
      if (term === t) best = Math.min(best, 0);
      else if (term.startsWith(t)) best = Math.min(best, 1);
      else if (term.split(' ').some((w) => w.startsWith(t))) best = Math.min(best, 2);
    }
    if (best < 9) scored.push([best, c]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, max).map((x) => x[1]);
}
