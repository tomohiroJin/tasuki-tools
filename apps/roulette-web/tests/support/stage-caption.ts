import { screen } from '@testing-library/react';

/** 舞台の結果の一言（`.roulette-caption`）。脇の区画にも role=status があるので、役割だけでは一意にならない */
export const stageCaption = (): HTMLElement => {
  const found = screen.getAllByRole('status').find((el) => el.classList.contains('roulette-caption'));
  if (found === undefined) throw new Error('結果の一言（.roulette-caption）が無い');
  return found;
};
