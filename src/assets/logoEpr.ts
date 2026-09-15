// EPR Paraná Logo SVG and Base64 Data for Web UI and PDF Generation

export const EPR_PARANA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <!-- Background Navy Blue -->
  <rect width="400" height="400" rx="36" fill="#072b4a"/>
  
  <g transform="translate(45, 95)">
    <!-- Letter 'e' -->
    <path d="M 52,140 C 22,140 0,118 0,80 C 0,42 24,18 56,18 C 88,18 108,40 108,78 C 108,86 106,90 98,90 L 25,90 C 27,112 40,123 60,123 C 74,123 85,116 91,105 L 108,114 C 98,131 80,140 52,140 Z M 25,74 L 84,74 C 83,53 72,34 56,34 C 39,34 27,51 25,74 Z" fill="#ffffff" />
    
    <!-- Letter 'r' -->
    <path d="M 230,30 L 254,30 L 254,58 C 263,38 279,28 300,28 L 305,48 C 285,48 266,60 256,76 L 256,140 L 230,140 Z" fill="#ffffff" />
    
    <!-- White base parts of 'p' -->
    <path d="M 125,28 L 150,28 L 150,60 C 160,40 176,28 200,28 C 228,28 248,50 248,88 C 248,126 226,148 198,148 C 176,148 160,136 150,116 L 150,180 L 125,180 Z" fill="#ffffff" opacity="0.95" />
    
    <!-- Green Dynamic Swoop ribbon of EPR linking 'e', 'p' and 'r' -->
    <path d="M 88,88 C 120,40 160,15 210,18 C 255,20 285,55 260,95 C 235,135 185,160 148,155 C 130,152 125,135 135,120 C 148,100 190,82 225,68 C 245,60 250,45 235,38 C 215,30 175,45 140,82 C 122,102 100,125 78,140 L 60,120 C 82,104 100,80 115,55 Z" fill="#67ba7b" opacity="0.9" />

    <!-- Stylized 'p' bowl accent in green -->
    <path d="M 128,88 C 128,140 128,185 152,185 C 158,185 158,155 158,135 C 168,148 184,152 200,150 C 235,145 254,115 254,84 C 254,48 232,24 195,24 C 165,24 145,45 136,75 Z" fill="#67ba7b" />
    <ellipse cx="188" cy="85" rx="30" ry="36" fill="#072b4a" />

    <!-- Text "PARANÁ" -->
    <text x="285" y="185" text-anchor="end" font-family="Montserrat, Arial, sans-serif" font-weight="900" font-size="28" fill="#ffffff" letter-spacing="0.5">PARANÁ</text>
  </g>
</svg>`;

export const EPR_PARANA_LOGO_BASE64 = `data:image/svg+xml;utf8,${encodeURIComponent(EPR_PARANA_SVG)}`;
