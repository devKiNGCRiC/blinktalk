// Countries and languages for profiles and stranger chat filters.
// Names come from the browser (Intl.DisplayNames), so only the codes live here.

const COUNTRY_CODES = (
    'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ ' +
    'DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG ' +
    'LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY ' +
    'PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM ' +
    'TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW'
).split(' ');

const LANGUAGE_CODES = [
    'en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'es', 'fr', 'de', 'pt',
    'it', 'ru', 'ar', 'tr', 'ja', 'ko', 'zh', 'id', 'vi', 'th', 'fa', 'pl', 'nl'
];

/** "IN" → 🇮🇳 */
export function flagOf(code) {
    if (!/^[A-Z]{2}$/.test(code || '')) return '';
    return String.fromCodePoint(...[...code].map(letter => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

function displayNames(type) {
    try {
        return new Intl.DisplayNames(['en'], { type });
    } catch {
        return { of: code => code };
    }
}

const regionNames = displayNames('region');
const languageNames = displayNames('language');

export const COUNTRIES = COUNTRY_CODES
    .map(code => ({ code, name: regionNames.of(code) || code, flag: flagOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));

export const LANGUAGES = LANGUAGE_CODES
    .map(code => ({ code, name: languageNames.of(code) || code }))
    .sort((a, b) => a.name.localeCompare(b.name));

export function countryName(code) {
    return COUNTRIES.find(country => country.code === code)?.name || code;
}

export const GENDERS = [
    { value: 'female', label: 'Woman', plural: 'Women' },
    { value: 'male', label: 'Man', plural: 'Men' },
    { value: 'nonbinary', label: 'Non-binary', plural: 'Non-binary people' }
];
