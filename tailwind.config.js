/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./public/**/*.html"],
    future: {
        // Emit :hover only inside @media (hover: hover) and (pointer: fine).
        // Without it, iOS applies the hover style on tap and it sticks until the
        // next tap somewhere else (cards stay lifted, CTAs stay dark green).
        hoverOnlyWhenSupported: true,
    },
    theme: {
        extend: {
            fontFamily: {
                'sans': ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                'brand-blue': '#005a9c',
                'brand-green': '#1f7a33',
            }
        }
    },
    plugins: [],
}
