import axios from 'axios';

export interface ICompany {
    id: number;
    company_name: string;
    liked: boolean;
}

export interface ICollection {
    id: string;
    collection_name: string;
    companies: ICompany[];
    total: number;
}

export interface ICompanyBatchResponse {
    companies: ICompany[];
}

export interface IAddCompaniesRequest {
    company_ids: number[];
}

export interface IAddCompaniesResponse {
    message: string;
    added_count: number;
    total_companies_in_target: number;
}

export interface ICollectionCompanyIdsResponse {
    company_ids: number[];
    total_count: number;
}

const BASE_URL = 'http://localhost:8000';

export async function getCompanies(offset?: number, limit?: number): Promise<ICompanyBatchResponse> {
    try {
        const response = await axios.get(`${BASE_URL}/companies`, {
            params: {
                offset,
                limit,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function getCollectionsById(id: string, offset?: number, limit?: number): Promise<ICollection> {
    try {
        const response = await axios.get(`${BASE_URL}/collections/${id}`, {
            params: {
                offset,
                limit,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function getCollectionsMetadata(): Promise<ICollection[]> {
    try {
        const response = await axios.get(`${BASE_URL}/collections`);
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function addCompaniesToCollection(
    targetCollectionId: string,
    companyIds: number[]
): Promise<IAddCompaniesResponse> {
    try {
        const response = await axios.post(`${BASE_URL}/collections/${targetCollectionId}/add-companies`, {
            company_ids: companyIds,
        });
        return response.data;
    } catch (error) {
        console.error('Error adding companies to collection:', error);
        throw error;
    }
}

export async function getCollectionCompanyIds(collectionId: string): Promise<ICollectionCompanyIdsResponse> {
    try {
        const response = await axios.get(`${BASE_URL}/collections/${collectionId}/company-ids`);
        return response.data;
    } catch (error) {
        console.error('Error fetching collection company IDs:', error);
        throw error;
    }
}