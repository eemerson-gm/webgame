const positionPrecision = 1000;

export const quantizePosition = (x: number, y: number) => ({
  x: Math.round(x * positionPrecision) / positionPrecision,
  y: Math.round(y * positionPrecision) / positionPrecision,
});
