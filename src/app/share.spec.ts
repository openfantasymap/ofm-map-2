import { ShareDirective } from './share';

describe('ShareDirective', () => {
  it('opens its url in a share popup', () => {
    const open = spyOn(window, 'open');
    const d = new ShareDirective();
    d.url = 'https://example.org/share';
    d.onClick(new MouseEvent('click'));
    expect(open).toHaveBeenCalledWith('https://example.org/share', 'share', jasmine.any(String));
  });
});
