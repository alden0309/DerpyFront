// DFSTORE (r21): where a nation's flag image lives. An AI persona's emblem
// (flag "persona_<id>") is a Derp Store picture served at the site root with
// the skins; every other nation flies a flag from resources/flags.

export function nationFlagPath(code: string): string {
  return code.startsWith("persona_")
    ? `/derpy-emblems/${code}.svg`
    : `/flags/${code}.svg`;
}
