import { PLAYER_SKINS } from "./data.js?v=1.5.6";

export function characterArtwork(skinId = "astral", side = "player") {
  const skin = PLAYER_SKINS.find((item) => item.id === skinId) || PLAYER_SKINS[0];
  const facing = side === "enemy" ? " actor-art-enemy" : "";
  if (skin.image) {
    return `<img class="actor-art actor-art-portrait${facing}" src="${skin.image}" alt="" draggable="false" />`;
  }
  const costumeMark = {
    astral: `<path fill="${skin.trim}" d="m50 78 3 4-3 4-3-4Z"/><circle cx="50" cy="82" r="1.2" fill="#fff4c3"/><path fill="${skin.trim}" d="m30 103 2 3-2 3-2-3Zm40-8 2 3-2 3-2-3Z"/>`,
    ember: `<path fill="${skin.accent}" d="m25 71 8-12 2 14-6 8Zm50 0-8-12-2 14 6 8Z"/><path fill="${skin.trim}" d="M38 105q12 7 24 0l2 7q-14 7-28 0Z"/>`,
    tide: `<path fill="none" stroke="${skin.trim}" stroke-width="2" d="M24 99q8-6 16 0t16 0 16 0m-46 7q8-6 16 0t16 0 16 0"/><path fill="${skin.accent}" d="m31 59 7 5-5 8-7-7m43-6-7 5 5 8 7-7Z"/>`,
    grove: `<path fill="${skin.trim}" d="M50 78q-10 3-6 11 7-1 6-11Zm1 0q10 3 6 11-7-1-6-11Zm-22 13q-8 3-4 9 6-1 4-9Zm42 0q8 3 4 9-6-1-4-9Z"/><path fill="none" stroke="${skin.trim}" stroke-width="1.4" d="M50 83v13m-20-3 5 7m30-7-5 7"/>`,
  }[skin.id];
  return `<svg class="actor-art${facing}" viewBox="0 0 100 128" role="presentation" focusable="false">
    <ellipse class="actor-shadow" cx="50" cy="119" rx="26" ry="5" />
    <path fill="${skin.cloak}" d="M29 57 18 111q31 16 64 0L70 57Z" />
    <path fill="${skin.robe}" d="M35 58q15-9 30 0l12 54q-27 13-54 0Z" />
    ${costumeMark}
    <path fill="${skin.trim}" d="m47 67 3 2 3-2 8 43-11 10-11-10Z" />
    <path fill="${skin.accent}" d="M33 61q17 11 34 0l-4 11q-13 8-26 0Z" />
    <path fill="${skin.cloak}" d="M31 60 22 79l11 9 9-15M69 60l9 19-11 9-9-15" />
    <path fill="${skin.trim}" d="m31 78 9 5-6 8-8-7M69 78l-9 5 6 8 8-7" />
    <path fill="${skin.hair}" d="M31 37q-3-23 19-25 23 1 21 28l-8 18H38Z" />
    <ellipse cx="50" cy="39" rx="17" ry="20" fill="#f0c7a2" />
    <path fill="${skin.hair}" d="M33 35q7-15 21-15 10 0 17 9-10-4-16-11-8 10-22 12Z" />
    <path fill="${skin.hair}" d="M33 35q-3 15 5 21l2-15m26-7q4 17-4 23l-2-16" />
    <path fill="#332d35" d="M40 41q3-3 6 0l-1 2h-4m12-2q3-3 6 0l-1 2h-4" />
    <path fill="none" stroke="#9b655e" stroke-width="1.4" stroke-linecap="round" d="M46 50q4 3 8 0" />
    <path fill="${skin.cloak}" d="M36 55q14 7 28 0l-4 8H40Z" />
    <path fill="none" stroke="${skin.trim}" stroke-width="2" d="M50 72v41" />
    <path fill="none" stroke="#9f7659" stroke-width="4" stroke-linecap="round" d="m76 75 13-28" />
    <path fill="${skin.trim}" d="m87 44 3-8 4 8-4 7Z" />
    <circle cx="90" cy="42" r="3" fill="#fff0ad" class="actor-staff-glow" />
  </svg>`;
}

