export class Calc {
  static wrap(num: number, min: number, max: number) {
    num = (num - min) % (max - min);
    return num + (num < 0 ? max : min);
  }

  static random(value = 1) {
    return (Math.random() - 0.5) * value;
  }
}
