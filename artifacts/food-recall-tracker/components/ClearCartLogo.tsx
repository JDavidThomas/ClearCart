import { Image } from 'react-native';

interface ClearCartLogoProps {
  size: number;
}

export function ClearCartLogo({ size }: ClearCartLogoProps) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessible={false}
      resizeMode="contain"
      source={require('../assets/icon.png')}
      style={{ height: size, width: size }}
    />
  );
}
