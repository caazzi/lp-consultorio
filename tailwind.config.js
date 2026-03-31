/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./*.html"],
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
