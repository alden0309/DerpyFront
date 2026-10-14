# Draws the AI persona emblems (DFSTORE r21) as small 3:2 SVG flags into
# resources/public/derpy-emblems/persona_<id>.svg:
#   python3 scripts/derpy-emblems/emblems.py resources/public/derpy-emblems Each pack has its own charge; each persona
# its own colours and layout.
import os, sys

OUT = sys.argv[1]

# Charges, drawn in a 100x100 box centred at (150, 100) (scaled by 0.9).
CHARGES = {
    "skull": """
<g fill="{c}">
 <path d="M50 12c-20 0-34 13-34 31 0 10 5 18 12 23v12h10v-7h6v7h12v-7h6v7h10V66c7-5 12-13 12-23 0-18-14-31-34-31z"/>
</g>
<g fill="{f}"><ellipse cx="37" cy="44" rx="8" ry="9"/><ellipse cx="63" cy="44" rx="8" ry="9"/><path d="M50 52l-5 9h10z"/></g>
<g stroke="{c}" stroke-width="7" stroke-linecap="round"><path d="M14 86L86 98M14 98L86 86"/></g>""",
    "crown": """
<g fill="{c}">
 <path d="M14 76L8 30l22 20 20-34 20 34 22-20-6 46z"/>
 <rect x="14" y="80" width="72" height="10" rx="2"/>
</g>
<g fill="{f}"><circle cx="50" cy="60" r="6"/><circle cx="30" cy="64" r="4"/><circle cx="70" cy="64" r="4"/></g>""",
    "coin": """
<circle cx="50" cy="52" r="38" fill="{c}"/>
<circle cx="50" cy="52" r="29" fill="none" stroke="{f}" stroke-width="4"/>
<g fill="{f}"><path d="M50 30v44M38 40h24M34 40l-8 16h16zM66 40l-8 16h16z" stroke="{f}" stroke-width="4" stroke-linejoin="round"/></g>""",
    "flask": """
<g fill="{c}">
 <path d="M40 10h20v6h-3v24l26 44c3 6-1 12-8 12H25c-7 0-11-6-8-12l26-44V16h-3z"/>
</g>
<g fill="{f}"><path d="M28 74l12-20h20l12 20c2 4-1 8-5 8H33c-4 0-7-4-5-8z" opacity="0.85"/><circle cx="45" cy="66" r="4" fill="{c}"/><circle cx="57" cy="72" r="3" fill="{c}"/></g>
<g fill="{c}"><circle cx="70" cy="22" r="5"/><circle cx="80" cy="10" r="3"/></g>""",
    "axes": """
<g stroke="{c}" stroke-width="7" stroke-linecap="round"><path d="M20 90L74 20M80 90L26 20"/></g>
<g fill="{c}"><path d="M66 12c12-2 22 6 24 18-10 0-18-4-24-10z"/><path d="M34 12c-12-2-22 6-24 18 10 0 18-4 24-10z"/></g>
<circle cx="50" cy="56" r="10" fill="{f}" stroke="{c}" stroke-width="4"/>""",
}

# Field layouts: (name, svg) with {a} field, {b} second colour.
LAYOUTS = {
    "plain": '<rect width="300" height="200" fill="{a}"/>',
    "border": '<rect width="300" height="200" fill="{b}"/><rect x="14" y="14" width="272" height="172" fill="{a}"/>',
    "chief": '<rect width="300" height="200" fill="{a}"/><rect width="300" height="44" fill="{b}"/>',
    "bend": '<rect width="300" height="200" fill="{a}"/><path d="M0 0h60L300 160v40h-60L0 40z" fill="{b}" opacity="0.9"/>',
    "pale": '<rect width="300" height="200" fill="{a}"/><rect x="0" width="70" height="200" fill="{b}"/><rect x="230" width="70" height="200" fill="{b}"/>',
    "saltire": '<rect width="300" height="200" fill="{a}"/><path d="M0 0L300 200M300 0L0 200" stroke="{b}" stroke-width="26"/>',
    "quarter": '<rect width="300" height="200" fill="{a}"/><rect width="150" height="100" fill="{b}"/><rect x="150" y="100" width="150" height="100" fill="{b}"/>',
    "stripes": '<rect width="300" height="200" fill="{a}"/><rect y="40" width="300" height="24" fill="{b}"/><rect y="136" width="300" height="24" fill="{b}"/>',
}

# pack -> (charge, [(persona, layout, field, second, charge colour, charge fill/detail)])
PACKS = {
    "pirates": ("skull", [
        ("redbeard", "plain", "#1a1a1a", "#1a1a1a", "#f5f5f5", "#1a1a1a"),
        ("saltqueen", "border", "#0f2c4c", "#d4af37", "#f1f5f9", "#0f2c4c"),
        ("blackwake", "bend", "#111111", "#8b0000", "#f5f5f5", "#111111"),
        ("coinhook", "chief", "#14213d", "#e9c46a", "#e9c46a", "#14213d"),
        ("barnacle", "stripes", "#2f3e46", "#84a98c", "#cad2c5", "#2f3e46"),
        ("powderkeg", "saltire", "#2b0a0a", "#e85d04", "#ffba08", "#2b0a0a"),
    ]),
    "empires": ("crown", [
        ("ironcrown", "plain", "#3a3a3a", "#3a3a3a", "#c0c0c0", "#7f1d1d"),
        ("marble", "border", "#e7e5e4", "#57534e", "#57534e", "#e7e5e4"),
        ("gilded", "quarter", "#6b21a8", "#facc15", "#facc15", "#6b21a8"),
        ("eagle", "chief", "#7f1d1d", "#fbbf24", "#fbbf24", "#7f1d1d"),
        ("citadel", "pale", "#1e3a8a", "#e5e7eb", "#e5e7eb", "#1e3a8a"),
        ("wildfire", "bend", "#450a0a", "#f97316", "#fdba74", "#450a0a"),
    ]),
    "merchants": ("coin", [
        ("goldleaf", "plain", "#065f46", "#065f46", "#fcd34d", "#065f46"),
        ("saffron", "stripes", "#c2410c", "#fde68a", "#fde68a", "#c2410c"),
        ("ledger", "border", "#1f2937", "#9ca3af", "#e5e7eb", "#1f2937"),
        ("lantern", "chief", "#991b1b", "#fbbf24", "#fbbf24", "#991b1b"),
        ("tollgate", "quarter", "#334155", "#94a3b8", "#fcd34d", "#334155"),
        ("monopolia", "saltire", "#14532d", "#166534", "#fde047", "#14532d"),
    ]),
    "scientists": ("flask", [
        ("voltwhistle", "bend", "#1e1b4b", "#facc15", "#a5f3fc", "#22d3ee"),
        ("beaker", "plain", "#064e3b", "#064e3b", "#d1fae5", "#4ade80"),
        ("clockwork", "quarter", "#78350f", "#b45309", "#fde68a", "#f59e0b"),
        ("gamma", "border", "#1a2e05", "#a3e635", "#ecfccb", "#84cc16"),
        ("fizzbang", "stripes", "#581c87", "#f472b6", "#fbcfe8", "#ec4899"),
        ("zeppelin", "chief", "#0c4a6e", "#e2e8f0", "#e0f2fe", "#38bdf8"),
    ]),
    "warlords": ("axes", [
        ("dustdevil", "plain", "#92400e", "#92400e", "#fde68a", "#b45309"),
        ("ironhoof", "border", "#292524", "#a8a29e", "#d6d3d1", "#57534e"),
        ("canyon", "stripes", "#9a3412", "#fdba74", "#ffedd5", "#9a3412"),
        ("greywolf", "bend", "#374151", "#9ca3af", "#f3f4f6", "#374151"),
        ("railhead", "pale", "#1c1917", "#78716c", "#e7e5e4", "#1c1917"),
        ("dynamite", "saltire", "#7f1d1d", "#1c1917", "#fecaca", "#dc2626"),
    ]),
}

os.makedirs(OUT, exist_ok=True)
n = 0
for pack, (charge, personas) in PACKS.items():
    for pid, layout, a, b, c, f in personas:
        body = LAYOUTS[layout].format(a=a, b=b)
        ch = CHARGES[charge].format(c=c, f=f)
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">'
            + body
            + (
                ''
                if layout == "plain"
                else f'<circle cx="150" cy="100" r="74" fill="{a}" stroke="{c}" stroke-width="5"/>'
            )
            + '<g transform="translate(88 40) scale(1.24)">'
            + ch.replace("\n", "")
            + "</g></svg>\n"
        )
        with open(os.path.join(OUT, f"persona_{pack}_{pid}.svg"), "w") as fh:
            fh.write(svg)
        n += 1
print(n, "emblems")
