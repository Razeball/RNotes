export type PageSize = 'letter' | 'a4' | 'legal';

export interface PageModel {
  name: string;
  widthPx: number;
  heightPx: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

const PAGE_MODELS: Record<PageSize, PageModel> = {
  letter: {
    name: 'Letter',
    widthPx: 816,   
    heightPx: 1056,  
    marginTop: 60,
    marginBottom: 60,
    marginLeft: 96,
    marginRight: 96,
  },
  a4: {
    name: 'A4',
    widthPx: 794,   
    heightPx: 1123,  
    marginTop: 60,
    marginBottom: 60,
    marginLeft: 96,
    marginRight: 96,
  },
  legal: {
    name: 'Legal',
    widthPx: 816,   
    heightPx: 1344,  
    marginTop: 60,
    marginBottom: 60,
    marginLeft: 96,
    marginRight: 96,
  },
};

export function getPageModel(size: PageSize): PageModel {
  return PAGE_MODELS[size];
}

export function getContentHeight(
  model: PageModel,
  headerHeight: number,
  footerHeight: number,
): number {
  return model.heightPx - model.marginTop - model.marginBottom - headerHeight - footerHeight;
}

export function getCssPageSize(size: PageSize): string {
  switch (size) {
    case 'letter': return 'letter portrait';
    case 'a4': return 'A4 portrait';
    case 'legal': return 'legal portrait';
  }
}
