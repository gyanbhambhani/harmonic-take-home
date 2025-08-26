import { Button, Snackbar, Alert, CircularProgress, Box, Typography } from '@mui/material';
import { useState } from 'react';
import { addCompaniesToCollection, getCollectionCompanyIds } from '../utils/jam-api';

interface CollectionActionsProps {
    sourceCollectionId: string;
    sourceCollectionName: string;
    targetCollectionId: string;
    targetCollectionName: string;
    selectedCompanyIds: number[];
    onSuccess: () => void;
}

export default function CollectionActions({
    sourceCollectionId,
    sourceCollectionName,
    targetCollectionId,
    targetCollectionName,
    selectedCompanyIds,
    onSuccess
}: CollectionActionsProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isSelectAllLoading, setIsSelectAllLoading] = useState(false);
    const [snackbar, setSnackbar] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info';
    }>({ open: false, message: '', severity: 'info' });

    const handleAddSelected = async () => {
        if (selectedCompanyIds.length === 0) {
            setSnackbar({
                open: true,
                message: 'Please select at least one company',
                severity: 'info'
            });
            return;
        }

        setIsLoading(true);
        try {
            const response = await addCompaniesToCollection(targetCollectionId, selectedCompanyIds);
            setSnackbar({
                open: true,
                message: response.message,
                severity: 'success'
            });
            onSuccess();
        } catch (error) {
            setSnackbar({
                open: true,
                message: 'Failed to add companies. Please try again.',
                severity: 'error'
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddAll = async () => {
        setIsSelectAllLoading(true);
        try {
            // Get all company IDs from the source collection
            const response = await getCollectionCompanyIds(sourceCollectionId);
            
            if (response.company_ids.length === 0) {
                setSnackbar({
                    open: true,
                    message: 'No companies found in the source collection',
                    severity: 'info'
                });
                return;
            }

            // Add all companies to the target collection
            const addResponse = await addCompaniesToCollection(targetCollectionId, response.company_ids);
            setSnackbar({
                open: true,
                message: addResponse.message,
                severity: 'success'
            });
            onSuccess();
        } catch (error) {
            setSnackbar({
                open: true,
                message: 'Failed to add all companies. Please try again.',
                severity: 'error'
            });
        } finally {
            setIsSelectAllLoading(false);
        }
    };

    const handleCloseSnackbar = () => {
        setSnackbar({ ...snackbar, open: false });
    };

    return (
        <Box sx={{ mb: 2, p: 2, border: '1px solid #ddd', borderRadius: 1, backgroundColor: '#f5f5f5' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
                Add to {targetCollectionName}
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    onClick={handleAddSelected}
                    disabled={isLoading || isSelectAllLoading || selectedCompanyIds.length === 0}
                    startIcon={isLoading ? <CircularProgress size={16} /> : null}
                >
                    {isLoading ? 'Adding...' : `Add Selected (${selectedCompanyIds.length})`}
                </Button>

                <Button
                    variant="outlined"
                    onClick={handleAddAll}
                    disabled={isLoading || isSelectAllLoading}
                    startIcon={isSelectAllLoading ? <CircularProgress size={16} /> : null}
                >
                    {isSelectAllLoading ? 'Adding All...' : 'Add All from ' + sourceCollectionName}
                </Button>
            </Box>

            {isSelectAllLoading && (
                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                        This may take a while due to database throttling...
                    </Typography>
                </Box>
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
