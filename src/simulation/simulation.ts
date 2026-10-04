export class Simulation {
  public readonly queue: string[] = [];

  public enqueue(command: string) {
    this.queue.push(command);
  }

  public step(deltaTime: number) {
    console.log('stepping', deltaTime);
  }

  public captureSnapshot() {
    console.log('Capturing snapshot...');
  }

  public replaceWorld(validatedWorld: object) {
    console.log('Replacing world...', validatedWorld);
  }
}
