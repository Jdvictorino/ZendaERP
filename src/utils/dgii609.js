// Catálogos del Formato de Envío de Pagos al Exterior (609), según el instructivo de la DGII (marzo 2026).
// Los valores son los textos de las listas de la plantilla oficial.

export const SERVICIOS_609 = {
    'Gastos de personal': ['Sueldos y salarios', 'Otros gastos de personal'],
    'Gastos por trabajos, suministros y servicios': [
        'Honorarios por servicios profesionales (Personas Morales)',
        'Honorarios por servicios profesionales (Personas Físicas)',
        'Seguridad, mensajería, transporte y otros servicios (Personas Físicas)',
        'Seguridad, mensajería, transporte y otros servicios (Personas Morales)',
    ],
    'Arrendamientos': ['De inmuebles (a Personas Físicas)', 'De inmuebles (a Personas Morales)', 'Otros arrendamientos'],
    'Gastos de activos fijos': ['Reparación', 'Mantenimiento'],
    'Gastos de representación': ['Relaciones públicas', 'Publicidad', 'Promociones', 'Otros gastos de representación'],
    'Gastos financieros': [
        'Por préstamos con bancos', 'Por préstamos con financieras', 'Por préstamos con personas físicas',
        'Por préstamos con organismos internacionales', 'Otros gastos financieros',
    ],
    'Gastos de seguros': ['Gastos de seguros'],
    'Gastos por regalías y otros intangibles': ['Cesión / uso marca', 'Transferencia de know-how', 'Cesión / uso de patente', 'Otras regalías'],
};

// Países ISO 3166-1 alfa-2; el nombre sale del navegador en español
const ISO_CODES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ '
    + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR '
    + 'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP '
    + 'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT '
    + 'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW '
    + 'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG '
    + 'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');

export const PAISES = (() => {
    let names;
    try { names = new Intl.DisplayNames(['es'], { type: 'region' }); } catch { names = null; }
    return ISO_CODES
        .filter((code) => code !== 'DO') // un pago al exterior no va a República Dominicana
        .map((code) => ({ code, name: names?.of(code) || code }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
})();
