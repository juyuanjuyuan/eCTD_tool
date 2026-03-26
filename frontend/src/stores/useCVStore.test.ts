import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCVStore } from './useCVStore';
import { cvApi } from '../services/cv';

// Mock the CV API
vi.mock('../services/cv', () => ({
  cvApi: {
    getApplicationTypes: vi.fn(),
    getProductTypes: vi.fn(),
    getRegulatoryActivityTypes: vi.fn(),
    getSequenceTypes: vi.fn(),
  },
}));

const mockGetAppTypes = cvApi.getApplicationTypes as ReturnType<typeof vi.fn>;
const mockGetProdTypes = cvApi.getProductTypes as ReturnType<typeof vi.fn>;
const mockGetRatTypes = cvApi.getRegulatoryActivityTypes as ReturnType<typeof vi.fn>;
const mockGetSqtTypes = cvApi.getSequenceTypes as ReturnType<typeof vi.fn>;

describe('useCVStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useCVStore.setState({
      applicationTypes: [],
      productTypes: [],
      regulatoryActivityTypes: [],
      sequenceTypes: [],
    });
  });

  it('has correct initial state', () => {
    const state = useCVStore.getState();
    expect(state.applicationTypes).toEqual([]);
    expect(state.productTypes).toEqual([]);
    expect(state.regulatoryActivityTypes).toEqual([]);
    expect(state.sequenceTypes).toEqual([]);
  });

  it('fetchApplicationTypes populates store', async () => {
    const mockData = [
      { code: 'cnapt1', descriptionZh: '临床试验申请', descriptionEn: 'Clinical Trial' },
      { code: 'cnapt2', descriptionZh: '新药申请', descriptionEn: 'New Drug' },
    ];
    mockGetAppTypes.mockResolvedValue(mockData);

    await useCVStore.getState().fetchApplicationTypes();

    expect(useCVStore.getState().applicationTypes).toEqual(mockData);
    expect(mockGetAppTypes).toHaveBeenCalledTimes(1);
  });

  it('fetchProductTypes populates store', async () => {
    const mockData = [
      { code: 'cnprt1', descriptionZh: '化学药品', descriptionEn: 'Chemical Drug' },
    ];
    mockGetProdTypes.mockResolvedValue(mockData);

    await useCVStore.getState().fetchProductTypes();

    expect(useCVStore.getState().productTypes).toEqual(mockData);
  });

  it('fetchRegulatoryActivityTypes with filter', async () => {
    const mockData = [
      { code: 'cnrat1', descriptionZh: '首次申请', descriptionEn: 'Initial' },
    ];
    mockGetRatTypes.mockResolvedValue(mockData);

    await useCVStore.getState().fetchRegulatoryActivityTypes('cnapt1');

    expect(mockGetRatTypes).toHaveBeenCalledWith('cnapt1');
    expect(useCVStore.getState().regulatoryActivityTypes).toEqual(mockData);
  });

  it('fetchSequenceTypes with filters', async () => {
    const mockData = [
      { code: 'cnsqt1', descriptionZh: '首次提交', descriptionEn: 'Initial' },
    ];
    mockGetSqtTypes.mockResolvedValue(mockData);

    await useCVStore.getState().fetchSequenceTypes('cnapt2', 'cnrat1');

    expect(mockGetSqtTypes).toHaveBeenCalledWith('cnapt2', 'cnrat1');
    expect(useCVStore.getState().sequenceTypes).toEqual(mockData);
  });

  it('getCvLabel returns Chinese description for known code', async () => {
    useCVStore.setState({
      applicationTypes: [
        { code: 'cnapt1', descriptionZh: '临床试验申请', descriptionEn: 'Clinical Trial' } as any,
      ],
      productTypes: [
        { code: 'cnprt2', descriptionZh: '生物制品', descriptionEn: 'Biological Product' } as any,
      ],
    });

    expect(useCVStore.getState().getCvLabel('cnapt1')).toBe('临床试验申请');
    expect(useCVStore.getState().getCvLabel('cnprt2')).toBe('生物制品');
  });

  it('getCvLabel returns code itself for unknown code', () => {
    expect(useCVStore.getState().getCvLabel('unknown-code')).toBe('unknown-code');
  });

  it('getCvLabel searches across all CV types', async () => {
    useCVStore.setState({
      applicationTypes: [],
      productTypes: [],
      regulatoryActivityTypes: [
        { code: 'cnrat3', descriptionZh: '再注册', descriptionEn: 'Re-registration' } as any,
      ],
      sequenceTypes: [
        { code: 'cnsqt4', descriptionZh: '格式转换', descriptionEn: 'Format Conversion' } as any,
      ],
    });

    expect(useCVStore.getState().getCvLabel('cnrat3')).toBe('再注册');
    expect(useCVStore.getState().getCvLabel('cnsqt4')).toBe('格式转换');
  });
});
