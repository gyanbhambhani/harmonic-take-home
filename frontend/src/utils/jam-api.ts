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
    progress?: {
        total_requested: number;
        already_existed: number;
        newly_added: number;
        completion_percentage: number;
    };
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

interface ProgressData {
    type: 'start' | 'progress' | 'complete' | 'error';
    message?: string;
    total?: number;
    processed?: number;
    progress?: number;
    newly_added?: number;
    total_processed?: number;
}

export async function addCompaniesToCollectionStream(
    targetCollectionId: string,
    companyIds: number[],
    onProgress: (data: ProgressData) => void
): Promise<void> {
    try {
        const response = await fetch(`${BASE_URL}/collections/${targetCollectionId}/add-companies-stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ company_ids: companyIds }),
        });

        if (!response.ok) {
            throw new Error('Failed to start streaming operation');
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        
        let shouldContinue = true;
        while (shouldContinue) {
            const { done, value } = await reader.read();
            if (done) {
                shouldContinue = false;
                break;
            }
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        onProgress(data);
                        
                        if (data.type === 'complete' || data.type === 'error') {
                            shouldContinue = false;
                            return;
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in streaming operation:', error);
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

export async function toggleCompanyInCollection(
    collectionId: string,
    companyId: number
): Promise<{ message: string; is_in_collection: boolean }> {
    try {
        const response = await axios.post(`${BASE_URL}/collections/${collectionId}/toggle-company/${companyId}`);
        return response.data;
    } catch (error) {
        console.error('Error toggling company in collection:', error);
        throw error;
    }
}


export async function likeCompaniesBulk(
    companyIds: number[]
): Promise<{ 
    message: string; 
    newly_liked: number; 
    already_liked: number; 
    total_liked: number;
    progress: {
        total_requested: number;
        newly_liked: number;
        already_liked: number;
        completion_percentage: number;
    };
}> {
    try {
        const response = await axios.post(`${BASE_URL}/collections/like-companies`, {
            company_ids: companyIds,
        });
        return response.data;
    } catch (error) {
        console.error('Error liking companies:', error);
        throw error;
    }
}

export async function unlikeCompaniesBulk(
    companyIds: number[]
): Promise<{ 
    message: string; 
    newly_unliked: number; 
    already_unliked: number; 
    total_liked: number;
    progress: {
        total_requested: number;
        newly_unliked: number;
        already_unliked: number;
        completion_percentage: number;
    };
}> {
    try {
        const response = await axios.post(`${BASE_URL}/collections/unlike-companies`, {
            company_ids: companyIds,
        });
        return response.data;
    } catch (error) {
        console.error('Error unliking companies:', error);
        throw error;
    }
}

interface ProgressData {
    type: 'start' | 'progress' | 'complete' | 'error';
    message?: string;
    total?: number;
    processed?: number;
    progress?: number;
    newly_liked?: number;
    newly_unliked?: number;
    already_liked?: number;
    already_unliked?: number;
    current_company?: string;
    company_id?: number;
    operation?: 'like' | 'unlike';
    total_processed?: number;
}

export async function likeCompaniesStream(
    companyIds: number[],
    onProgress: (data: ProgressData) => void
): Promise<void> {
    try {
        const response = await fetch(`${BASE_URL}/collections/like-companies-stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ company_ids: companyIds }),
        });

        if (!response.ok) {
            throw new Error('Failed to start streaming operation');
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        
        let shouldContinue = true;
        while (shouldContinue) {
            const { done, value } = await reader.read();
            if (done) {
                shouldContinue = false;
                break;
            }
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        onProgress(data);
                        
                        if (data.type === 'complete' || data.type === 'error') {
                            shouldContinue = false;
                            return;
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in streaming operation:', error);
        throw error;
    }
}

export async function unlikeCompaniesStream(
    companyIds: number[],
    onProgress: (data: ProgressData) => void
): Promise<void> {
    try {
        const response = await fetch(`${BASE_URL}/collections/unlike-companies-stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ company_ids: companyIds }),
        });

        if (!response.ok) {
            throw new Error('Failed to start streaming operation');
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        
        let shouldContinue = true;
        while (shouldContinue) {
            const { done, value } = await reader.read();
            if (done) {
                shouldContinue = false;
                break;
            }
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        onProgress(data);
                        
                        if (data.type === 'complete' || data.type === 'error') {
                            shouldContinue = false;
                            return;
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in streaming operation:', error);
        throw error;
    }
}