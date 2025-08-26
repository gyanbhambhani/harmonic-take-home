import { 
    Button, 
    Snackbar, 
    Alert, 
    CircularProgress, 
    Box, 
    Typography,
    LinearProgress,
    Card,
    CardContent,
    Chip,
    Divider
} from '@mui/material';
import { useState } from 'react';
import { addCompaniesToCollectionStream, getCollectionCompanyIds } from '../utils/jam-api';
import ConfirmationModal from './ConfirmationModal';

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

    const [progress, setProgress] = useState<{
        current: number;
        total: number;
        message: string;
        isActive: boolean;
    }>({ current: 0, total: 0, message: '', isActive: false });
    
    const [snackbar, setSnackbar] = useState<{
        open: boolean;
        message: string;
        severity: 'success' | 'error' | 'info';
    }>({ open: false, message: '', severity: 'info' });

    // Confirmation modals
    const [showSelectedModal, setShowSelectedModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);

    const handleAddSelected = () => {
        if (selectedCompanyIds.length === 0) {
            setSnackbar({
                open: true,
                message: 'Please select at least one company',
                severity: 'info'
            });
            return;
        }
        setShowSelectedModal(true);
    };

    const confirmAddSelected = async () => {
        setModalLoading(true);
        setShowSelectedModal(false);
        setProgress({ current: 0, total: selectedCompanyIds.length, message: 'Adding selected companies...', isActive: true });
        
        try {
            await addCompaniesToCollectionStream(targetCollectionId, selectedCompanyIds, (data) => {
                if (data.type === 'start') {
                    setProgress({ 
                        current: 0, 
                        total: data.total || selectedCompanyIds.length, 
                        message: 'Starting to add companies...', 
                        isActive: true 
                    });
                } else if (data.type === 'progress') {
                    setProgress({ 
                        current: data.processed || 0, 
                        total: data.total || selectedCompanyIds.length, 
                        message: `Processing company ${data.processed || 0} of ${data.total || selectedCompanyIds.length}...`, 
                        isActive: true 
                    });
                } else if (data.type === 'complete') {
                    setProgress({ 
                        current: data.total_processed || selectedCompanyIds.length, 
                        total: data.total_processed || selectedCompanyIds.length, 
                        message: `✅ ${data.message}`, 
                        isActive: false 
                    });
                    
                    setSnackbar({
                        open: true,
                        message: data.message || 'Successfully added companies',
                        severity: 'success'
                    });
                    onSuccess();
                } else if (data.type === 'error') {
                    setProgress({ current: 0, total: 0, message: '', isActive: false });
                    setSnackbar({
                        open: true,
                        message: data.message || 'Failed to add companies',
                        severity: 'error'
                    });
                }
            });
        } catch (error) {
            setProgress({ current: 0, total: 0, message: '', isActive: false });
            setSnackbar({
                open: true,
                message: 'Failed to add companies. Please try again.',
                severity: 'error'
            });
        } finally {
            setModalLoading(false);
        }
    };

    const handleAddAll = () => {
        setShowBulkModal(true);
    };

    const confirmAddAll = async () => {
        setModalLoading(true);
        setShowBulkModal(false);
        setProgress({ current: 0, total: 0, message: 'Fetching all companies...', isActive: true });
        
        try {
            // Get all company IDs from the source collection
            const response = await getCollectionCompanyIds(sourceCollectionId);
            
            if (response.company_ids.length === 0) {
                setProgress({ current: 0, total: 0, message: '', isActive: false });
                setSnackbar({
                    open: true,
                    message: 'No companies found in the source collection',
                    severity: 'info'
                });
                return;
            }

            // Add all companies to the target collection with streaming
            await addCompaniesToCollectionStream(targetCollectionId, response.company_ids, (data) => {
                if (data.type === 'start') {
                    setProgress({ 
                        current: 0, 
                        total: data.total || response.company_ids.length, 
                        message: 'Starting to add all companies...', 
                        isActive: true 
                    });
                } else if (data.type === 'progress') {
                    setProgress({ 
                        current: data.processed || 0, 
                        total: data.total || response.company_ids.length, 
                        message: `Processing company ${data.processed || 0} of ${data.total || response.company_ids.length}...`, 
                        isActive: true 
                    });
                } else if (data.type === 'complete') {
                    setProgress({ 
                        current: data.total_processed || response.company_ids.length, 
                        total: data.total_processed || response.company_ids.length, 
                        message: `✅ ${data.message}`, 
                        isActive: false 
                    });
                    
                    setSnackbar({
                        open: true,
                        message: data.message || 'Successfully added all companies',
                        severity: 'success'
                    });
                    onSuccess();
                } else if (data.type === 'error') {
                    setProgress({ current: 0, total: 0, message: '', isActive: false });
                    setSnackbar({
                        open: true,
                        message: data.message || 'Failed to add companies',
                        severity: 'error'
                    });
                }
            });
        } catch (error) {
            setProgress({ current: 0, total: 0, message: '', isActive: false });
            setSnackbar({
                open: true,
                message: 'Failed to add all companies. Please try again.',
                severity: 'error'
            });
        } finally {
            setModalLoading(false);
        }
    };

    const handleCloseSnackbar = () => {
        setSnackbar({ ...snackbar, open: false });
    };

    const progressPercentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

    return (
        <Card sx={{ mb: 3, boxShadow: 2, border: '1px solid #e0e0e0' }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#1976d2' }}>
                        📁 Add to {targetCollectionName}
                    </Typography>
                    <Chip 
                        label={`${selectedCompanyIds.length} selected`} 
                        size="small" 
                        color="primary" 
                        sx={{ ml: 2 }}
                    />
                </Box>
                
                <Divider sx={{ mb: 2 }} />
                
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                    <Button
                        variant="contained"
                        onClick={handleAddSelected}
                        disabled={modalLoading || selectedCompanyIds.length === 0}
                        startIcon={modalLoading ? <CircularProgress size={16} /> : null}
                        sx={{ 
                            minWidth: 200,
                            background: 'linear-gradient(45deg, #1976d2 30%, #42a5f5 90%)',
                            '&:hover': {
                                background: 'linear-gradient(45deg, #1565c0 30%, #1976d2 90%)',
                            }
                        }}
                    >
                        {modalLoading ? 'Processing...' : `Multi Select (${selectedCompanyIds.length})`}
                    </Button>

                    <Button
                        variant="outlined"
                        onClick={handleAddAll}
                        disabled={modalLoading}
                        startIcon={modalLoading ? <CircularProgress size={16} /> : null}
                        sx={{ 
                            minWidth: 200,
                            borderColor: '#ff9800',
                            color: '#ff9800',
                            '&:hover': {
                                borderColor: '#f57c00',
                                backgroundColor: 'rgba(255, 152, 0, 0.04)',
                            }
                        }}
                    >
                        {modalLoading ? 'Processing...' : `Add All from ${sourceCollectionName}`}
                </Button>
                </Box>

                {/* Progress Section */}
                {(progress.isActive || progress.message) && (
                    <Box sx={{ mt: 2, p: 2, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1, border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: 'text.primary' }}>
                            {progress.message}
                        </Typography>
                        
                        {progress.isActive && progress.total > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={progressPercentage} 
                                    sx={{ 
                                        flexGrow: 1, 
                                        height: 8, 
                                        borderRadius: 4,
                                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                        '& .MuiLinearProgress-bar': {
                                            background: 'linear-gradient(45deg, #1976d2 30%, #42a5f5 90%)',
                                        }
                                    }}
                                />
                                <Typography variant="body2" color="text.secondary">
                                    {Math.round(progressPercentage)}%
                                </Typography>
                            </Box>
                        )}
                        
                        {progress.total > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                {progress.current} of {progress.total} companies processed
                            </Typography>
                        )}
                    </Box>
                )}

                                {/* Performance Warning */}
                {(modalLoading || progress.total > 1000) && (
                    <Box sx={{ mt: 2, p: 1.5, backgroundColor: '#fff3cd', borderRadius: 1, border: '1px solid #ffeaa7' }}>
                        <Typography variant="body2" color="#856404" sx={{ display: 'flex', alignItems: 'center' }}>
                            ⚡ Large operations may take time due to database throttling (1ms per insert)
                        </Typography>
                    </Box>
                )}
            </CardContent>

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

            {/* Confirmation Modals */}
            <ConfirmationModal
                open={showSelectedModal}
                onClose={() => setShowSelectedModal(false)}
                onConfirm={confirmAddSelected}
                title="Add Selected Companies"
                message={`Are you sure you want to add ${selectedCompanyIds.length} selected companies to ${targetCollectionName}?`}
                confirmText="Add Companies"
                cancelText="Cancel"
                severity="info"
                loading={modalLoading}
                details={{
                    count: selectedCompanyIds.length,
                    sourceCollection: sourceCollectionName,
                    targetCollection: targetCollectionName
                }}
            />

            <ConfirmationModal
                open={showBulkModal}
                onClose={() => setShowBulkModal(false)}
                onConfirm={confirmAddAll}
                title="Add All Companies"
                message={`This will add ALL companies from ${sourceCollectionName} to ${targetCollectionName}. This operation may take some time due to database throttling.`}
                confirmText="Add All Companies"
                cancelText="Cancel"
                severity="warning"
                loading={modalLoading}
                details={{
                    sourceCollection: sourceCollectionName,
                    targetCollection: targetCollectionName
                }}
            />
        </Card>
    );
}
