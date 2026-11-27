/** Palette du site CODES Africa. Les motifs gardent leurs couleurs d'origine (écrites en dur). */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette du site CODES Africa (codesafricaNew) : bleus profonds, accents cyan-turquoise.
        brand: { 50: '#e6f7fb', 100: '#cceef5', 200: '#99dceb', 300: '#66c9e0', 400: '#33b6d6', 500: '#00a3cc', 600: '#0088a8', 700: '#006680', 800: '#004455', 900: '#002230', 950: '#001118' },
        accent: { 50: '#e6fbf7', 100: '#ccf5ee', 200: '#99ebdd', 300: '#66e1cc', 400: '#33d7bb', 500: '#00cdaa', 600: '#00a888', 700: '#007e66', 800: '#005544', 900: '#002c22' },
        // Bleu profond (remplace l'ancien doré) : statuts et repères, distinct du bleu principal.
        royal: { 50: '#eef4fd', 100: '#dbe8fb', 200: '#b8d0f6', 300: '#8fb4ef', 400: '#5b8def', 500: '#2f6fde', 600: '#1f57b8', 700: '#173f86', 800: '#102d61' },
        ink: { 50: '#f5f7fa', 100: '#eaeef3', 200: '#d0d8e0', 300: '#a8b5c2', 400: '#7888a0', 500: '#5a6a82', 600: '#3d4d65', 700: '#2a3848', 800: '#1a2533', 900: '#0d1520', 950: '#070b12' },
      },
      fontFamily: {
        display: ['Anton', 'Impact', 'sans-serif'],
        elegant: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
