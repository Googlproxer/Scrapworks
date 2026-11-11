import { fromEvent, Subscription } from 'rxjs';
import { ITEM_NAMES, OPENING_RECIPES } from '../../../../src/content/opening';

const spriteRoot = '../../sprites/v1/png/128/';
const subscriptions = new Subscription();
const recipeSelect = document.querySelector<HTMLSelectElement>('[data-sprite-recipe]');
const resultImage = document.querySelector<HTMLImageElement>('[data-recipe-image]');
const resultName = document.querySelector<HTMLElement>('[data-recipe-name]');
const resultQuantity = document.querySelector<HTMLElement>('[data-recipe-quantity]');
const ingredients = document.querySelector<HTMLElement>('[data-recipe-ingredients]');
const duration = document.querySelector<HTMLElement>('[data-recipe-duration]');
const craftButton = document.querySelector<HTMLButtonElement>('[data-craft-button]');
const batchSelect = document.querySelector<HTMLSelectElement>('[data-sprite-batch]');
const fabImage = document.querySelector<HTMLImageElement>('[data-fab-image]');
const fabName = document.querySelector<HTMLElement>('[data-fab-name]');

if (
  recipeSelect &&
  resultImage &&
  resultName &&
  resultQuantity &&
  ingredients &&
  duration &&
  craftButton &&
  batchSelect &&
  fabImage &&
  fabName
) {
  const recipes = OPENING_RECIPES.filter((recipe) => recipe.handcraft);
  for (const recipe of recipes) {
    const option = document.createElement('option');
    option.value = recipe.id;
    option.textContent = recipe.name;
    recipeSelect.append(option);
  }
  recipeSelect.value = 'scrap-prybar';

  const render = () => {
    const recipe = recipes.find((candidate) => candidate.id === recipeSelect.value);
    if (!recipe) return;
    const item = recipe.outputs[0];
    const id = item?.item ?? 'mini-fabricator';
    const name = ITEM_NAMES[id] ?? recipe.name;
    const batch = Number(batchSelect.value);
    const quantity = (item?.quantity ?? 1) * batch;
    resultImage.src = spriteRoot + id + '.png';
    resultName.textContent = name;
    resultQuantity.textContent = 'Makes ' + quantity;
    duration.textContent = recipe.seconds * batch + ' s total';
    craftButton.textContent = 'Handcraft ' + batch;
    const rows = recipe.inputs.map((input) => {
      const row = document.createElement('li');
      row.className = 'ingredient inset';
      const image = document.createElement('img');
      image.className = 'item-sprite';
      image.src = spriteRoot + input.item + '.png';
      image.alt = '';
      image.width = 32;
      image.height = 32;
      const label = document.createElement('span');
      const amount = document.createElement('strong');
      amount.textContent = String(input.quantity * batch) + ' ';
      label.append(amount, ITEM_NAMES[input.item] ?? input.item);
      row.append(image, label);
      return row;
    });
    ingredients.replaceChildren(...rows);
    // A local visual preview of a completed request; no crafting or stock mutation.
    fabImage.src = resultImage.src;
    fabName.textContent = recipe.minifab ? '1 ' + name + ' ready' : 'MiniFab assembled';
  };
  subscriptions.add(fromEvent(recipeSelect, 'change').subscribe(render));
  subscriptions.add(fromEvent(batchSelect, 'change').subscribe(render));
  subscriptions.add(
    fromEvent<PageTransitionEvent>(window, 'pagehide').subscribe((event) => {
      if (!event.persisted) subscriptions.unsubscribe();
    }),
  );
  render();
}
