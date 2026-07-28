import { TransformFnParams } from 'class-transformer';

export const trim = ({ value }: TransformFnParams): any => {
  return typeof value === 'string' ? value.trim() : value;
};

export const trimAndToLowerCase = ({ value }: TransformFnParams): any => {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
};

export const trimAndToUpperCase = ({ value }: TransformFnParams): any => {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
};