import localFont from 'next/font/local';

export const anybody = localFont({
  src: [
    {
      path: '../assets/fonts/Anybody-Variable.ttf',
      weight: '100 900',
      style: 'normal',
    },
    {
      path: '../assets/fonts/Anybody-Italic-Variable.ttf',
      weight: '100 900',
      style: 'italic',
    },
  ],
  variable: '--font-anybody',
  display: 'swap',
});

export const jetBrainsMono = localFont({
  src: '../assets/fonts/JetBrainsMono-Variable.ttf',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
});

export const tjJoyOfSinging = localFont({
  src: [
    {
      path: '../assets/fonts/TJJoyofsingingL.otf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../assets/fonts/TJJoyofsingingM.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/TJJoyofsingingB.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../assets/fonts/TJJoyofsingingEB.otf',
      weight: '800',
      style: 'normal',
    },
  ],
  variable: '--font-tj-joy',
  display: 'swap',
});
