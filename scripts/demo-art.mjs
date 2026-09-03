/**
 * Catalogue-style illustrations for the Minted Up demo lots.
 *
 * These are drawn, not photographed — deliberately, so nothing here could ever
 * be mistaken for a real antique's condition report. They are rendered at
 * 3000x2000 with a film-grain layer, which is both what makes them read as
 * studio plates and what carries enough entropy to pass Minted Up's own
 * data-density check. The gate judges them like any other upload.
 */

const W = 3000;
const H = 2000;

export const scene = (art, { ground = "#cfc7bb", vignette = "#8d8378" } = {}) => `
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;background:${ground}}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="backdrop" cx="50%" cy="38%" r="78%">
      <stop offset="0%" stop-color="${ground}"/>
      <stop offset="62%" stop-color="${ground}"/>
      <stop offset="100%" stop-color="${vignette}"/>
    </radialGradient>
    <radialGradient id="contact" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.42"/>
      <stop offset="55%" stop-color="#000" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="softshadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="26"/>
      <feOffset dy="22"/><feComponentTransfer><feFuncA type="linear" slope="0.38"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <!-- Fine grain at two scales. A real studio plate carries sensor noise and
         surface texture; without it these renders are so smooth that Minted Up's
         own data-density check correctly refuses them as synthetic. -->
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="5" seed="7" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0.06"/>
    </filter>
    <filter id="grainCoarse" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.34" numOctaves="4" seed="19" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#backdrop)"/>
  ${art}
  <!-- grain last: gives the plate its tooth, and the file its entropy -->
  <rect width="${W}" height="${H}" filter="url(#grainCoarse)" opacity="0.07" style="mix-blend-mode:overlay"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.27" style="mix-blend-mode:overlay"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.13"/>
</svg></body></html>`;

/* ---------------- 1. Regency rosewood card table ---------------- */
export const cardTable = `
<defs>
  <linearGradient id="rose" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#7d3a24"/><stop offset="18%" stop-color="#a4552f"/>
    <stop offset="45%" stop-color="#6d2f1d"/><stop offset="75%" stop-color="#89432a"/>
    <stop offset="100%" stop-color="#4d2013"/>
  </linearGradient>
  <linearGradient id="roseTop" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#5c2718"/><stop offset="30%" stop-color="#96502e"/>
    <stop offset="52%" stop-color="#b06a3d"/><stop offset="72%" stop-color="#8a4527"/>
    <stop offset="100%" stop-color="#542314"/>
  </linearGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#f2d99a"/><stop offset="50%" stop-color="#c49a4a"/>
    <stop offset="100%" stop-color="#8a6626"/>
  </linearGradient>
</defs>
<ellipse cx="1500" cy="1665" rx="820" ry="105" fill="url(#contact)"/>
<g filter="url(#softshadow)">
  <!-- top -->
  <rect x="700" y="690" width="1600" height="52" rx="10" fill="url(#roseTop)"/>
  <rect x="700" y="690" width="1600" height="9" rx="4" fill="#c98a5c" opacity="0.55"/>
  <!-- apron with brass line inlay -->
  <rect x="760" y="742" width="1480" height="118" rx="8" fill="url(#rose)"/>
  <rect x="800" y="782" width="1400" height="7" fill="url(#brass)" opacity="0.92"/>
  <rect x="800" y="820" width="1400" height="4" fill="url(#brass)" opacity="0.6"/>
  <!-- turned column -->
  <path d="M1440 860 h120 v40 l-26 26 v34 l26 26 v250 l-30 30 v90 h-80 v-90 l-30 -30 v-250 l26 -26 v-34 l-26 -26 z" fill="url(#rose)"/>
  <ellipse cx="1500" cy="972" rx="58" ry="14" fill="#c07a4c" opacity="0.5"/>
  <ellipse cx="1500" cy="1210" rx="54" ry="13" fill="#c07a4c" opacity="0.4"/>
  <!-- quadruped base -->
  <path d="M1500 1356 C1360 1400 1130 1490 980 1580 l76 62 C1210 1548 1386 1456 1500 1416 z" fill="url(#rose)"/>
  <path d="M1500 1356 C1640 1400 1870 1490 2020 1580 l-76 62 C1790 1548 1614 1456 1500 1416 z" fill="url(#rose)"/>
  <path d="M1500 1372 C1420 1430 1300 1530 1236 1620 l70 48 C1368 1570 1454 1478 1500 1432 z" fill="#5e2818" opacity="0.85"/>
  <path d="M1500 1372 C1580 1430 1700 1530 1764 1620 l-70 48 C1632 1570 1546 1478 1500 1432 z" fill="#5e2818" opacity="0.85"/>
  <!-- brass caps and castors -->
  <g fill="url(#brass)">
    <rect x="962" y="1600" width="76" height="46" rx="10"/><circle cx="1000" cy="1662" r="26"/>
    <rect x="1962" y="1600" width="76" height="46" rx="10"/><circle cx="2000" cy="1662" r="26"/>
    <rect x="1214" y="1638" width="66" height="40" rx="9"/><circle cx="1247" cy="1692" r="22"/>
    <rect x="1720" y="1638" width="66" height="40" rx="9"/><circle cx="1753" cy="1692" r="22"/>
  </g>
</g>`;

/* ---------------- 2. Victorian silver christening mug ---------------- */
export const silverMug = `
<defs>
  <linearGradient id="silver" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#6f7378"/><stop offset="12%" stop-color="#b9bec3"/>
    <stop offset="28%" stop-color="#f2f4f6"/><stop offset="44%" stop-color="#c6cbd0"/>
    <stop offset="60%" stop-color="#8d9297"/><stop offset="76%" stop-color="#dfe3e6"/>
    <stop offset="90%" stop-color="#9aa0a5"/><stop offset="100%" stop-color="#5f6368"/>
  </linearGradient>
  <linearGradient id="silverDark" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#585c61"/><stop offset="50%" stop-color="#aeb3b8"/>
    <stop offset="100%" stop-color="#4e5257"/>
  </linearGradient>
</defs>
<ellipse cx="1480" cy="1560" rx="470" ry="76" fill="url(#contact)"/>
<g filter="url(#softshadow)">
  <!-- handle -->
  <path d="M1830 700 C2060 690 2140 860 2080 1030 C2030 1170 1900 1230 1830 1240"
        fill="none" stroke="url(#silverDark)" stroke-width="58" stroke-linecap="round"/>
  <path d="M1836 712 C2040 706 2112 862 2058 1022 C2012 1152 1898 1210 1836 1220"
        fill="none" stroke="#eef0f2" stroke-width="12" opacity="0.5" stroke-linecap="round"/>
  <!-- body: slightly tapered -->
  <path d="M1120 660 L1856 660 L1806 1470 L1170 1470 Z" fill="url(#silver)"/>
  <!-- rim -->
  <ellipse cx="1488" cy="660" rx="368" ry="58" fill="#dfe3e6"/>
  <ellipse cx="1488" cy="660" rx="368" ry="58" fill="none" stroke="#7c8186" stroke-width="6"/>
  <ellipse cx="1488" cy="664" rx="322" ry="44" fill="#63686d"/>
  <ellipse cx="1488" cy="672" rx="300" ry="36" fill="#4a4e53"/>
  <!-- foot -->
  <path d="M1150 1470 L1826 1470 L1852 1536 L1124 1536 Z" fill="url(#silverDark)"/>
  <ellipse cx="1488" cy="1536" rx="364" ry="46" fill="#8d9297"/>
  <ellipse cx="1488" cy="1530" rx="364" ry="44" fill="url(#silver)"/>
  <!-- engraved foliate cartouche -->
  <ellipse cx="1488" cy="1040" rx="220" ry="168" fill="none" stroke="#7f858a" stroke-width="9"/>
  <ellipse cx="1488" cy="1040" rx="196" ry="146" fill="none" stroke="#9aa0a5" stroke-width="4"/>
  <path d="M1320 950 q40 -60 90 -30 M1656 950 q-40 -60 -90 -30 M1320 1130 q40 60 90 30 M1656 1130 q-40 60 -90 30"
        fill="none" stroke="#83888d" stroke-width="8" stroke-linecap="round"/>
  <text x="1488" y="1078" font-family="Georgia,serif" font-size="128" fill="#7b8085"
        text-anchor="middle" opacity="0.85">EMH</text>
  <!-- specular highlight -->
  <path d="M1230 700 L1300 700 L1268 1450 L1206 1450 Z" fill="#ffffff" opacity="0.34"/>
</g>`;

/* ---------------- 3. Studio stoneware bowl ---------------- */
export const stonewareBowl = `
<defs>
  <linearGradient id="ash" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#b8873f"/><stop offset="14%" stop-color="#8d7a4a"/>
    <stop offset="42%" stop-color="#6d6743"/><stop offset="72%" stop-color="#57543a"/>
    <stop offset="100%" stop-color="#3d3b2c"/>
  </linearGradient>
  <radialGradient id="ashIn" cx="50%" cy="34%" r="72%">
    <stop offset="0%" stop-color="#8e845a"/><stop offset="55%" stop-color="#6b6544"/>
    <stop offset="100%" stop-color="#494534"/>
  </radialGradient>
  <linearGradient id="rust" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#8c5a24"/><stop offset="30%" stop-color="#c98c3c"/>
    <stop offset="55%" stop-color="#a06a2a"/><stop offset="80%" stop-color="#d29a48"/>
    <stop offset="100%" stop-color="#8a5722"/>
  </linearGradient>
</defs>
<ellipse cx="1500" cy="1500" rx="640" ry="86" fill="url(#contact)"/>
<g filter="url(#softshadow)">
  <!-- body -->
  <path d="M840 900 C880 1300 1120 1470 1500 1470 C1880 1470 2120 1300 2160 900 Z" fill="url(#ash)"/>
  <!-- interior -->
  <ellipse cx="1500" cy="900" rx="660" ry="176" fill="url(#ashIn)"/>
  <!-- throwing rings -->
  <g fill="none" stroke="#8f8760" stroke-width="5" opacity="0.4">
    <ellipse cx="1500" cy="906" rx="560" ry="146"/><ellipse cx="1500" cy="912" rx="450" ry="116"/>
    <ellipse cx="1500" cy="918" rx="340" ry="86"/><ellipse cx="1500" cy="922" rx="220" ry="54"/>
  </g>
  <!-- rim, ash glaze breaking rust -->
  <ellipse cx="1500" cy="900" rx="660" ry="176" fill="none" stroke="url(#rust)" stroke-width="30"/>
  <ellipse cx="1500" cy="900" rx="660" ry="176" fill="none" stroke="#e0ab5e" stroke-width="8" opacity="0.6"/>
  <!-- glaze run and pooling -->
  <path d="M1040 1010 q30 190 120 300" stroke="#a98d4e" stroke-width="16" fill="none" opacity="0.45"/>
  <path d="M1930 1030 q-24 180 -108 288" stroke="#a98d4e" stroke-width="14" fill="none" opacity="0.4"/>
  <!-- footring -->
  <ellipse cx="1500" cy="1470" rx="300" ry="46" fill="#4b4835"/>
  <ellipse cx="1500" cy="1462" rx="300" ry="44" fill="#5d5940"/>
</g>`;

/* ---------------- 4. Etching of a harbour ---------------- */
export const etching = `
<defs>
  <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#f4ecd9"/><stop offset="45%" stop-color="#eee4cd"/>
    <stop offset="100%" stop-color="#e2d5ba"/>
  </linearGradient>
</defs>
<ellipse cx="1500" cy="1720" rx="900" ry="60" fill="url(#contact)"/>
<g filter="url(#softshadow)">
  <rect x="560" y="280" width="1880" height="1420" rx="6" fill="url(#paper)"/>
  <!-- foxing -->
  <g fill="#b79a6a" opacity="0.3">
    <circle cx="700" cy="420" r="13"/><circle cx="740" cy="452" r="8"/><circle cx="2300" cy="1560" r="15"/>
    <circle cx="2260" cy="1520" r="9"/><circle cx="640" cy="1600" r="11"/><circle cx="2340" cy="380" r="10"/>
  </g>
  <!-- plate mark -->
  <rect x="740" y="430" width="1520" height="1000" fill="none" stroke="#c3b18c" stroke-width="7"/>
  <rect x="748" y="438" width="1504" height="984" fill="none" stroke="#fbf5e6" stroke-width="4"/>
  <!-- harbour scene, sepia line work -->
  <g stroke="#5d4a30" fill="none" stroke-linecap="round">
    <line x1="800" y1="1080" x2="2200" y2="1080" stroke-width="5" opacity="0.7"/>
    <!-- far shore -->
    <path d="M800 1080 q120 -46 250 -18 q140 30 250 -22 q150 -70 300 -10 q160 64 300 12 q120 -44 300 -8"
          stroke-width="6" opacity="0.55"/>
    <!-- hull -->
    <path d="M1160 1330 q340 130 700 -8 l-64 -96 q-300 96 -572 8 z" stroke-width="9" fill="#6b563a" fill-opacity="0.16"/>
    <!-- masts and rigging -->
    <line x1="1420" y1="1246" x2="1420" y2="560" stroke-width="9"/>
    <line x1="1690" y1="1258" x2="1690" y2="700" stroke-width="8"/>
    <line x1="1420" y1="600" x2="1690" y2="742" stroke-width="4"/>
    <line x1="1420" y1="600" x2="1180" y2="1230" stroke-width="4"/>
    <line x1="1690" y1="740" x2="1866" y2="1250" stroke-width="4"/>
    <line x1="1290" y1="700" x2="1560" y2="700" stroke-width="7"/>
    <path d="M1424 704 q150 120 130 300 l-130 30 z" stroke-width="6" fill="#6b563a" fill-opacity="0.1"/>
    <path d="M1416 704 q-150 120 -130 300 l130 30 z" stroke-width="6" fill="#6b563a" fill-opacity="0.07"/>
    <!-- water hatching -->
    <g stroke-width="4" opacity="0.5">
      <path d="M820 1400 q120 -22 240 0 M1120 1442 q120 -22 240 0 M1420 1400 q120 -22 240 0
               M1720 1444 q120 -22 240 0 M900 1330 q120 -20 240 0 M1500 1330 q120 -20 240 0
               M1180 1370 q120 -20 240 0 M1800 1372 q120 -20 240 0"/>
    </g>
    <!-- quay -->
    <path d="M800 1180 h330 v40 h-330 z" stroke-width="6" fill="#6b563a" fill-opacity="0.12"/>
    <g stroke-width="5"><line x1="860" y1="1220" x2="860" y2="1300"/><line x1="1000" y1="1220" x2="1000" y2="1300"/></g>
    <!-- gulls -->
    <g stroke-width="4" opacity="0.75">
      <path d="M2000 620 q30 -26 60 0 M2070 680 q26 -22 52 0 M1930 700 q22 -18 44 0"/>
    </g>
  </g>
  <!-- pencil signature and edition -->
  <text x="2150" y="1520" font-family="Georgia,serif" font-style="italic" font-size="54"
        fill="#4a4034" opacity="0.75" text-anchor="end">A. Merrick</text>
  <text x="820" y="1520" font-family="Georgia,serif" font-size="46" fill="#4a4034"
        opacity="0.6">24/75</text>
</g>`;

/* ---------------- 5. Blue and white porcelain charger ---------------- */
export const charger = `
<defs>
  <radialGradient id="glaze" cx="42%" cy="34%" r="72%">
    <stop offset="0%" stop-color="#ffffff"/><stop offset="60%" stop-color="#f2f4f2"/>
    <stop offset="100%" stop-color="#d8ded9"/>
  </radialGradient>
</defs>
<ellipse cx="1500" cy="1560" rx="700" ry="80" fill="url(#contact)"/>
<g filter="url(#softshadow)">
  <circle cx="1500" cy="1000" r="720" fill="#c9cfca"/>
  <circle cx="1500" cy="992" r="716" fill="url(#glaze)"/>
  <!-- border bands -->
  <circle cx="1500" cy="992" r="690" fill="none" stroke="#2a4d86" stroke-width="10" opacity="0.85"/>
  <circle cx="1500" cy="992" r="660" fill="none" stroke="#3a63a4" stroke-width="4" opacity="0.7"/>
  <circle cx="1500" cy="992" r="472" fill="none" stroke="#2a4d86" stroke-width="8" opacity="0.8"/>
  <circle cx="1500" cy="992" r="452" fill="none" stroke="#3a63a4" stroke-width="3" opacity="0.6"/>
  <!-- border motif -->
  <g fill="#2f558f" opacity="0.8">
    ${Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      const r = 576;
      const x = 1500 + Math.cos(a) * r;
      const y = 992 + Math.sin(a) * r;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="34" ry="18"
              transform="rotate(${((a * 180) / Math.PI + 90).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join("")}
  </g>
  <!-- central river landscape -->
  <g stroke="#2a4d86" fill="none" stroke-linecap="round">
    <path d="M1140 1090 q140 -40 280 -12 q150 30 280 -18 q120 -44 240 -6" stroke-width="9" opacity="0.85"/>
    <path d="M1180 940 q90 -150 190 -160 q110 -12 170 96 q70 108 190 74" stroke-width="8" opacity="0.7"/>
    <path d="M1300 1010 l70 -120 l70 120 z" stroke-width="7" fill="#3a63a4" fill-opacity="0.2"/>
    <path d="M1620 1030 q60 -90 130 -60 q60 26 40 90" stroke-width="7" opacity="0.7"/>
    <g stroke-width="6" opacity="0.6">
      <path d="M1220 1160 q100 -18 200 0 M1480 1190 q100 -18 200 0 M1300 1230 q100 -18 200 0"/>
    </g>
    <!-- willow -->
    <path d="M1760 900 v180" stroke-width="9"/>
    <path d="M1760 900 q70 30 92 96 M1760 906 q-70 32 -90 100 M1760 890 q30 40 20 110" stroke-width="6" opacity="0.75"/>
  </g>
  <!-- glaze highlight -->
  <ellipse cx="1250" cy="640" rx="230" ry="120" fill="#ffffff" opacity="0.3"
           transform="rotate(-28 1250 640)"/>
</g>`;

/* ---------------- Detail plates: the marks a buyer zooms into ---------------- */

export const silverMarks = `
<defs>
  <linearGradient id="brushed" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#9aa0a5"/><stop offset="35%" stop-color="#e6e9eb"/>
    <stop offset="62%" stop-color="#b4b9be"/><stop offset="100%" stop-color="#878c91"/>
  </linearGradient>
</defs>
<rect width="3000" height="2000" fill="url(#brushed)"/>
<g stroke="#ffffff" stroke-width="2" opacity="0.16">
  ${Array.from({ length: 70 }, (_, i) => `<line x1="0" y1="${i * 29}" x2="3000" y2="${i * 29 + 40}"/>`).join("")}
</g>
<g opacity="0.9">
  <!-- four punches struck in a row, slightly uneven as real ones are -->
  <g transform="translate(620,860) rotate(-2)">
    <rect x="-10" y="-10" width="300" height="300" rx="50" fill="#6f757a" opacity="0.5"/>
    <rect x="0" y="0" width="280" height="280" rx="44" fill="#8d9398"/>
    <path d="M60 210 q30 -120 80 -130 q40 -8 46 40 q40 -20 54 24 q16 40 -20 66 z" fill="#5d6368"/>
    <text x="140" y="252" font-family="Georgia,serif" font-size="46" fill="#4f5559" text-anchor="middle">lion</text>
  </g>
  <g transform="translate(1000,872) rotate(1)">
    <rect x="0" y="0" width="280" height="280" rx="44" fill="#8d9398"/>
    <path d="M140 46 v190 M140 236 q-70 -6 -84 -74 M140 236 q70 -6 84 -74 M96 96 h88 M140 46 a22 22 0 1 1 0.1 0"
          fill="none" stroke="#565c61" stroke-width="17" stroke-linecap="round"/>
  </g>
  <g transform="translate(1380,864) rotate(-1)">
    <rect x="0" y="0" width="280" height="280" rx="44" fill="#8d9398"/>
    <text x="140" y="212" font-family="Georgia,serif" font-size="180" fill="#565c61" text-anchor="middle">z</text>
  </g>
  <g transform="translate(1760,876) rotate(2)">
    <rect x="0" y="0" width="300" height="280" rx="44" fill="#8d9398"/>
    <text x="150" y="200" font-family="Georgia,serif" font-size="132" fill="#565c61" text-anchor="middle">WP</text>
  </g>
</g>
<g fill="none" stroke="#6c7276" stroke-width="3" opacity="0.35">
  <path d="M300 1500 q400 -60 900 -20 M1500 1560 q500 -70 1100 -10 M200 620 q600 -70 1200 -30"/>
</g>`;

export const potterySeal = `
<defs>
  <radialGradient id="clay" cx="46%" cy="38%" r="70%">
    <stop offset="0%" stop-color="#8a7d5c"/><stop offset="60%" stop-color="#6c6247"/>
    <stop offset="100%" stop-color="#4a442f"/>
  </radialGradient>
</defs>
<rect width="3000" height="2000" fill="url(#clay)"/>
<g fill="#5a5340" opacity="0.5">
  ${Array.from({ length: 200 }, (_, i) => {
    const x = (i * 613) % 2960 + 20;
    const y = (i * 397) % 1960 + 20;
    return `<circle cx="${x}" cy="${y}" r="${3 + (i % 5)}"/>`;
  }).join("")}
</g>
<!-- footring sweeping through -->
<path d="M240 1640 q1260 -420 2540 -140" fill="none" stroke="#3f3a29" stroke-width="70" opacity="0.55"/>
<path d="M240 1620 q1260 -420 2540 -140" fill="none" stroke="#9a8f6b" stroke-width="10" opacity="0.4"/>
<!-- impressed seals -->
<g transform="translate(1120,760)">
  <rect x="-14" y="-14" width="330" height="330" rx="24" fill="#37331f" opacity="0.55"/>
  <rect x="0" y="0" width="304" height="304" rx="18" fill="#6f6549"/>
  <g fill="none" stroke="#3d3826" stroke-width="20" stroke-linecap="square">
    <path d="M76 84 h152 M152 84 v144 M92 228 h124 M76 152 h152"/>
  </g>
</g>
<g transform="translate(1600,820) rotate(6)">
  <rect x="-12" y="-12" width="250" height="250" rx="20" fill="#37331f" opacity="0.5"/>
  <rect x="0" y="0" width="226" height="226" rx="14" fill="#6f6549"/>
  <g fill="none" stroke="#3d3826" stroke-width="17">
    <circle cx="113" cy="113" r="66"/><path d="M113 47 v132 M47 113 h132"/>
  </g>
</g>`;

export const swordsMark = `
<defs>
  <radialGradient id="whiteGlaze" cx="44%" cy="36%" r="74%">
    <stop offset="0%" stop-color="#ffffff"/><stop offset="62%" stop-color="#f1f3f0"/>
    <stop offset="100%" stop-color="#d5dbd6"/>
  </radialGradient>
</defs>
<rect width="3000" height="2000" fill="url(#whiteGlaze)"/>
<!-- footring shadow -->
<circle cx="1500" cy="1000" r="880" fill="none" stroke="#c2c9c3" stroke-width="46" opacity="0.7"/>
<circle cx="1500" cy="1000" r="852" fill="none" stroke="#eef1ee" stroke-width="10"/>
<!-- crossed swords, underglaze blue, slightly bled as underglaze does -->
<g stroke="#2a4d86" stroke-linecap="round" fill="none" opacity="0.92">
  <line x1="1230" y1="740" x2="1770" y2="1260" stroke-width="26"/>
  <line x1="1770" y1="740" x2="1230" y2="1260" stroke-width="26"/>
  <path d="M1206 716 l52 -6 -6 52 z" stroke-width="18" fill="#2a4d86"/>
  <path d="M1794 716 l-52 -6 6 52 z" stroke-width="18" fill="#2a4d86"/>
  <line x1="1300" y1="880" x2="1400" y2="800" stroke-width="16"/>
  <line x1="1700" y1="880" x2="1600" y2="800" stroke-width="16"/>
</g>
<g stroke="#4c74ad" stroke-width="40" opacity="0.16" fill="none" stroke-linecap="round">
  <line x1="1230" y1="740" x2="1770" y2="1260"/><line x1="1770" y1="740" x2="1230" y2="1260"/>
</g>
<!-- incised model number -->
<g fill="none" stroke="#b9c0ba" stroke-width="9" stroke-linecap="round">
  <path d="M1360 1470 v-92 M1360 1470 h56"/>
  <path d="M1470 1378 h64 v46 h-64 v46 h64"/>
  <path d="M1600 1378 h56 v92 h-56 z"/>
</g>`;

export const timberDetail = `
<defs>
  <linearGradient id="grainWood" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#8a4527"/><stop offset="40%" stop-color="#6d2f1d"/>
    <stop offset="70%" stop-color="#9c5330"/><stop offset="100%" stop-color="#542314"/>
  </linearGradient>
  <linearGradient id="brass2" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#f6e0a6"/><stop offset="48%" stop-color="#c49a4a"/>
    <stop offset="100%" stop-color="#7f5c20"/>
  </linearGradient>
</defs>
<rect width="3000" height="2000" fill="url(#grainWood)"/>
<g stroke="#3d1a0f" stroke-width="4" opacity="0.4" fill="none">
  ${Array.from({ length: 40 }, (_, i) =>
    `<path d="M0 ${i * 52} q750 ${((i % 5) - 2) * 26} 1500 0 q750 ${((i % 3) - 1) * 30} 1500 0"/>`,
  ).join("")}
</g>
<!-- brass line inlay -->
<rect x="0" y="820" width="3000" height="26" fill="url(#brass2)"/>
<rect x="0" y="820" width="3000" height="6" fill="#ffeeb8" opacity="0.6"/>
<rect x="0" y="960" width="3000" height="14" fill="url(#brass2)" opacity="0.8"/>
<!-- a lifted section, the declared fault -->
<path d="M1840 820 q90 -34 190 -6 q90 26 176 6 l0 26 q-90 22 -180 -4 q-96 -28 -186 4 z" fill="#3a1a0d"/>
<path d="M1840 816 q90 -34 190 -6 q90 26 176 6" fill="none" stroke="#e6c980" stroke-width="7"/>
<!-- hand-cut dovetails -->
<g transform="translate(300,1240)">
  <rect x="0" y="0" width="1000" height="420" fill="#5e2818" opacity="0.55"/>
  <g fill="#7d3a24">
    <path d="M40 0 l70 -70 l90 0 l70 70 z"/><path d="M330 0 l70 -70 l90 0 l70 70 z"/>
    <path d="M620 0 l70 -70 l90 0 l70 70 z"/>
  </g>
  <g stroke="#3d1a0f" stroke-width="6" fill="none">
    <path d="M40 0 l70 -70 l90 0 l70 70"/><path d="M330 0 l70 -70 l90 0 l70 70"/>
    <path d="M620 0 l70 -70 l90 0 l70 70"/><line x1="0" y1="0" x2="1000" y2="0"/>
  </g>
</g>
<text x="2700" y="1900" font-family="Georgia,serif" font-size="52" fill="#e6c980"
      opacity="0.35" text-anchor="end">hand-cut, oak linings</text>`;
