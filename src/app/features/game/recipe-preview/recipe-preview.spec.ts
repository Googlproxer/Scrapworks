import { TestBed } from '@angular/core/testing';
import { OPENING_RECIPES } from '@content/opening';
import { RecipePreview } from './recipe-preview';

describe('Recipe artwork', () => {
  it('shows the real result and batch inputs without changing the shared catalogue', async () => {
    const recipe = OPENING_RECIPES.find((entry) => entry.id === 'basic-research-kit')!;
    const before = structuredClone(recipe);
    const fixture = TestBed.createComponent(RecipePreview);
    fixture.componentRef.setInput('recipe', recipe);
    fixture.componentRef.setInput('quantity', 5);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('figcaption')!.textContent).toContain('Basic research kit');
    expect(root.querySelector('figcaption')!.textContent).toContain('Makes 5');
    expect(root.querySelectorAll('.ingredients li')).toHaveLength(2);
    expect(root.querySelector('.ingredients')!.textContent).toContain('5 Mechanical part');
    expect(root.querySelector('.ingredients')!.textContent).toContain('5 Electrical part');
    expect(root.querySelector('img')!.getAttribute('src')).toContain(
      'assets/ui/items/research-kit.png',
    );
    expect(recipe).toEqual(before);
    fixture.componentRef.setInput('showIngredients', false);
    await fixture.whenStable();
    expect(root.querySelector('.ingredients')).toBeNull();
    expect(root.querySelector('figcaption')!.textContent).toContain('Makes 5');
  });
});
