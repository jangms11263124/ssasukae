import localFont from 'next/font/local';

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
