/**
 * Countries by ISO 3166-1 alpha-2 code. Saves keep the code, so the same country is one folder in
 * the vault whatever it was called when it was saved ("USA", "United States", "日本"), and so each
 * folder can show its flag. Names here are the short English ones people use, not the formal ones.
 */
const NAMES =
  'AD:Andorra|AE:United Arab Emirates|AF:Afghanistan|AG:Antigua and Barbuda|AI:Anguilla|AL:Albania|AM:Armenia|AO:Angola|AQ:Antarctica|AR:Argentina|AS:American Samoa|AT:Austria|AU:Australia|AW:Aruba|AX:Åland Islands|AZ:Azerbaijan|' +
  'BA:Bosnia and Herzegovina|BB:Barbados|BD:Bangladesh|BE:Belgium|BF:Burkina Faso|BG:Bulgaria|BH:Bahrain|BI:Burundi|BJ:Benin|BL:Saint Barthélemy|BM:Bermuda|BN:Brunei|BO:Bolivia|BQ:Caribbean Netherlands|BR:Brazil|BS:Bahamas|BT:Bhutan|BW:Botswana|BY:Belarus|BZ:Belize|' +
  'CA:Canada|CC:Cocos Islands|CD:DR Congo|CF:Central African Republic|CG:Republic of the Congo|CH:Switzerland|CI:Ivory Coast|CK:Cook Islands|CL:Chile|CM:Cameroon|CN:China|CO:Colombia|CR:Costa Rica|CU:Cuba|CV:Cape Verde|CW:Curaçao|CX:Christmas Island|CY:Cyprus|CZ:Czechia|' +
  'DE:Germany|DJ:Djibouti|DK:Denmark|DM:Dominica|DO:Dominican Republic|DZ:Algeria|EC:Ecuador|EE:Estonia|EG:Egypt|EH:Western Sahara|ER:Eritrea|ES:Spain|ET:Ethiopia|' +
  'FI:Finland|FJ:Fiji|FK:Falkland Islands|FM:Micronesia|FO:Faroe Islands|FR:France|GA:Gabon|GB:United Kingdom|GD:Grenada|GE:Georgia|GF:French Guiana|GG:Guernsey|GH:Ghana|GI:Gibraltar|GL:Greenland|GM:Gambia|GN:Guinea|GP:Guadeloupe|GQ:Equatorial Guinea|GR:Greece|GT:Guatemala|GU:Guam|GW:Guinea-Bissau|GY:Guyana|' +
  'HK:Hong Kong|HN:Honduras|HR:Croatia|HT:Haiti|HU:Hungary|ID:Indonesia|IE:Ireland|IL:Israel|IM:Isle of Man|IN:India|IQ:Iraq|IR:Iran|IS:Iceland|IT:Italy|JE:Jersey|JM:Jamaica|JO:Jordan|JP:Japan|' +
  'KE:Kenya|KG:Kyrgyzstan|KH:Cambodia|KI:Kiribati|KM:Comoros|KN:Saint Kitts and Nevis|KP:North Korea|KR:South Korea|KW:Kuwait|KY:Cayman Islands|KZ:Kazakhstan|' +
  'LA:Laos|LB:Lebanon|LC:Saint Lucia|LI:Liechtenstein|LK:Sri Lanka|LR:Liberia|LS:Lesotho|LT:Lithuania|LU:Luxembourg|LV:Latvia|LY:Libya|' +
  'MA:Morocco|MC:Monaco|MD:Moldova|ME:Montenegro|MF:Saint Martin|MG:Madagascar|MH:Marshall Islands|MK:North Macedonia|ML:Mali|MM:Myanmar|MN:Mongolia|MO:Macau|MP:Northern Mariana Islands|MQ:Martinique|MR:Mauritania|MS:Montserrat|MT:Malta|MU:Mauritius|MV:Maldives|MW:Malawi|MX:Mexico|MY:Malaysia|MZ:Mozambique|' +
  'NA:Namibia|NC:New Caledonia|NE:Niger|NF:Norfolk Island|NG:Nigeria|NI:Nicaragua|NL:Netherlands|NO:Norway|NP:Nepal|NR:Nauru|NU:Niue|NZ:New Zealand|OM:Oman|' +
  'PA:Panama|PE:Peru|PF:French Polynesia|PG:Papua New Guinea|PH:Philippines|PK:Pakistan|PL:Poland|PM:Saint Pierre and Miquelon|PR:Puerto Rico|PS:Palestine|PT:Portugal|PW:Palau|PY:Paraguay|QA:Qatar|' +
  'RE:Réunion|RO:Romania|RS:Serbia|RU:Russia|RW:Rwanda|SA:Saudi Arabia|SB:Solomon Islands|SC:Seychelles|SD:Sudan|SE:Sweden|SG:Singapore|SH:Saint Helena|SI:Slovenia|SJ:Svalbard and Jan Mayen|SK:Slovakia|SL:Sierra Leone|SM:San Marino|SN:Senegal|SO:Somalia|SR:Suriname|SS:South Sudan|ST:São Tomé and Príncipe|SV:El Salvador|SX:Sint Maarten|SY:Syria|SZ:Eswatini|' +
  'TC:Turks and Caicos Islands|TD:Chad|TG:Togo|TH:Thailand|TJ:Tajikistan|TK:Tokelau|TL:Timor-Leste|TM:Turkmenistan|TN:Tunisia|TO:Tonga|TR:Turkey|TT:Trinidad and Tobago|TV:Tuvalu|TW:Taiwan|TZ:Tanzania|' +
  'UA:Ukraine|UG:Uganda|US:United States|UY:Uruguay|UZ:Uzbekistan|VA:Vatican City|VC:Saint Vincent and the Grenadines|VE:Venezuela|VG:British Virgin Islands|VI:US Virgin Islands|VN:Vietnam|VU:Vanuatu|WF:Wallis and Futuna|WS:Samoa|XK:Kosovo|YE:Yemen|YT:Mayotte|ZA:South Africa|ZM:Zambia|ZW:Zimbabwe';

/** Other things the same country gets called by captions, the AI and OpenStreetMap. */
const ALIASES: Record<string, string> = {
  usa: 'US',
  'u.s.a.': 'US',
  'u.s.': 'US',
  'united states of america': 'US',
  america: 'US',
  uk: 'GB',
  'u.k.': 'GB',
  'great britain': 'GB',
  britain: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  uae: 'AE',
  emirates: 'AE',
  'czech republic': 'CZ',
  turkiye: 'TR',
  'south korea': 'KR',
  korea: 'KR',
  'republic of korea': 'KR',
  'viet nam': 'VN',
  'russian federation': 'RU',
  'the netherlands': 'NL',
  holland: 'NL',
  burma: 'MM',
  "cote d'ivoire": 'CI',
  'cabo verde': 'CV',
  swaziland: 'SZ',
  macedonia: 'MK',
  'east timor': 'TL',
  'the bahamas': 'BS',
  'the gambia': 'GM',
  'democratic republic of the congo': 'CD',
  congo: 'CG',
  'lao pdr': 'LA',
  'hong kong sar': 'HK',
  macao: 'MO',
  'the philippines': 'PH',
  'the maldives': 'MV',
  vatican: 'VA',
  'holy see': 'VA',
  bosnia: 'BA',
  trinidad: 'TT',
  bharat: 'IN',
};

const fold = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const NAME_BY_CODE = new Map<string, string>();
const CODE_BY_NAME = new Map<string, string>(Object.entries(ALIASES));
for (const entry of NAMES.split('|')) {
  const [code, name] = entry.split(':');
  NAME_BY_CODE.set(code, name);
  CODE_BY_NAME.set(fold(name), code);
}

const isCode = (value: string) => NAME_BY_CODE.has(value);

/** The code for whatever a country was called, or undefined when it isn't recognised. */
export function countryCodeOf(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const upper = name.trim().toUpperCase();
  if (upper.length === 2 && isCode(upper)) return upper;
  return CODE_BY_NAME.get(fold(name));
}

/** A code as it arrives from a geocoder ("jp"), checked against the table. */
export function normalizeCountryCode(code: string | undefined): string | undefined {
  const upper = code?.trim().toUpperCase();
  return upper && isCode(upper) ? upper : undefined;
}

export function countryName(code: string | undefined): string | undefined {
  return code ? NAME_BY_CODE.get(code) : undefined;
}

/** The flag emoji: two regional-indicator letters. Systems without flag glyphs show the letters. */
export function flagOf(code: string | undefined): string | undefined {
  if (!code || !isCode(code)) return undefined;
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
