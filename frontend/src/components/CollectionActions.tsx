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
import { addCompaniesToCollectionStream, getCollectionCompanyIds, likeCompaniesStream, unlikeCompaniesStream } from '../utils/jam-api';
import ConfirmationModal from './ConfirmationModal';
import ProgressModal from './ProgressModal';

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
        currentCompany?: string;
        operation?: 'like' | 'unlike';
        newlyLiked?: number;
        newlyUnliked?: number;
        alreadyLiked?: number;
        alreadyUnliked?: number;
    }>({ current: 0, total: 0, message: '', isActive: false });

    // Helper function to safely update progress with optional message
    const updateProgress = (updates: Partial<typeof progress>) => {
        setProgress(prev => ({
            ...prev,
            ...updates,
            message: updates.message || prev.message
        }));
    };

    const [showProgressModal, setShowProgressModal] = useState(false);
    
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
        // Set up progress modal
        setProgress({ 
            current: 0, 
            total: selectedCompanyIds.length, 
            message: 'Starting operation...', 
            isActive: true,
            operation: sourceCollectionName === "My List" ? 'like' : 'unlike'
        });
        setShowProgressModal(true);
        
        try {
            // Use the streaming endpoints for real-time progress
            if (sourceCollectionName === "My List") {
                // Like companies with streaming
                await likeCompaniesStream(selectedCompanyIds, (data) => {
                    if (data.type === 'start') {
                        setProgress(prev => ({ 
                            ...prev, 
                            total: data.total || selectedCompanyIds.length,
                            message: 'Starting to like companies...'
                        }));
                    } else if (data.type === 'progress') {
                        setProgress(prev => ({ 
                            ...prev, 
                            current: data.processed || 0,
                            total: data.total || selectedCompanyIds.length,
                            message: `Processing company ${data.processed || 0} of ${data.total || selectedCompanyIds.length}...`,
                            currentCompany: data.current_company,
                            newlyLiked: data.newly_liked,
                            alreadyLiked: data.already_liked
                        }));
                    } else if (data.type === 'complete') {
                        updateProgress({ 
                            current: data.total_processed || selectedCompanyIds.length,
                            total: data.total_processed || selectedCompanyIds.length,
                            message: `✅ ${data.message || 'Operation completed'}`,
                            isActive: false,
                            newlyLiked: data.newly_liked,
                            alreadyLiked: data.already_liked
                        });
                        
                        setSnackbar({
                            open: true,
                            message: data.message,
                            severity: 'success'
                        });
                        onSuccess();
                    } else if (data.type === 'error') {
                        setProgress(prev => ({ ...prev, isActive: false }));
                        setSnackbar({
                            open: true,
                            message: data.message || 'Failed to like companies',
                            severity: 'error'
                        });
                    }
                });
            } else if (sourceCollectionName === "Liked Companies List") {
                // Unlike companies with streaming
                await unlikeCompaniesStream(selectedCompanyIds, (data) => {
                    if (data.type === 'start') {
                        setProgress(prev => ({ 
                            ...prev, 
                            total: data.total || selectedCompanyIds.length,
                            message: 'Starting to unlike companies...'
                        }));
                    } else if (data.type === 'progress') {
                        setProgress(prev => ({ 
                            ...prev, 
                            current: data.processed || 0,
                            total: data.total || selectedCompanyIds.length,
                            message: `Processing company ${data.processed || 0} of ${data.total || selectedCompanyIds.length}...`,
                            currentCompany: data.current_company,
                            newlyUnliked: data.newly_unliked,
                            alreadyUnliked: data.already_unliked
                        }));
                    } else if (data.type === 'complete') {
                        updateProgress({ 
                            current: data.total_processed || selectedCompanyIds.length,
                            total: data.total_processed || selectedCompanyIds.length,
                            message: `✅ ${data.message || 'Operation completed'}`,
                            isActive: false,
                            newlyUnliked: data.newly_unliked,
                            alreadyUnliked: data.already_unliked
                        });
                        
                        setSnackbar({
                            open: true,
                            message: data.message,
                            severity: 'success'
                        });
                        onSuccess();
                    } else if (data.type === 'error') {
                        setProgress(prev => ({ ...prev, isActive: false }));
                        setSnackbar({
                            open: true,
                            message: data.message || 'Failed to unlike companies',
                            severity: 'error'
                        });
                    }
                });
            } else {
                // Fallback to the old collection transfer logic
                await addCompaniesToCollectionStream(targetCollectionId, selectedCompanyIds, () => {
                    // Handle streaming response
                });
                setProgress(prev => ({ 
                    ...prev, 
                    current: selectedCompanyIds.length,
                    total: selectedCompanyIds.length,
                    message: "✅ Companies transferred successfully",
                    isActive: false
                }));
                setSnackbar({
                    open: true,
                    message: "Companies transferred successfully",
                    severity: 'success'
                });
                onSuccess();
            }
        } catch (error) {
            setProgress(prev => ({ ...prev, isActive: false }));
            setSnackbar({
                open: true,
                message: 'Failed to process companies. Please try again.',
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

            // Set up progress modal
            setProgress({ 
                current: 0, 
                total: response.company_ids.length, 
                message: 'Starting operation...', 
                isActive: true,
                operation: sourceCollectionName === "My List" ? 'like' : 'unlike'
            });
            setShowProgressModal(true);
            
            // Use the streaming endpoints for real-time progress
            if (sourceCollectionName === "My List") {
                // Like all companies with streaming
                await likeCompaniesStream(response.company_ids, (data) => {
                    if (data.type === 'start') {
                        setProgress(prev => ({ 
                            ...prev, 
                            total: data.total || response.company_ids.length,
                            message: 'Starting to like all companies...'
                        }));
                    } else if (data.type === 'progress') {
                        setProgress(prev => ({ 
                            ...prev, 
                            current: data.processed || 0,
                            total: data.total || response.company_ids.length,
                            message: `Processing company ${data.processed || 0} of ${data.total || response.company_ids.length}...`,
                            currentCompany: data.current_company,
                            newlyLiked: data.newly_liked,
                            alreadyLiked: data.already_liked
                        }));
                    } else if (data.type === 'complete') {
                        setProgress(prev => ({ 
                            ...prev, 
                            current: data.total_processed || response.company_ids.length,
                            total: data.total_processed || response.company_ids.length,
                            message: `✅ ${data.message || 'Operation completed'}`,
                            isActive: false,
                            newlyLiked: data.newly_liked,
                            alreadyLiked: data.already_liked
                        }));
                        
                        setSnackbar({
                            open: true,
                            message: data.message || 'Operation completed successfully',
                            severity: 'success'
                        });
                        onSuccess();
                    } else if (data.type === 'error') {
                        setProgress(prev => ({ ...prev, isActive: false }));
                        setSnackbar({
                            open: true,
                            message: data.message || 'Failed to like companies',
                            severity: 'error'
                        });
                    }
                });
            } else if (sourceCollectionName === "Liked Companies List") {
                // Unlike all companies with streaming
                await unlikeCompaniesStream(response.company_ids, (data) => {
                    if (data.type === 'start') {
                        setProgress(prev => ({ 
                            ...prev, 
                            total: data.total || response.company_ids.length,
                            message: 'Starting to unlike all companies...'
                        }));
                    } else if (data.type === 'progress') {
                        setProgress(prev => ({ 
                            ...prev, 
                            current: data.processed || 0,
                            total: data.total || response.company_ids.length,
                            message: `Processing company ${data.processed || 0} of ${data.total || response.company_ids.length}...`,
                            currentCompany: data.current_company,
                            newlyUnliked: data.newly_unliked,
                            alreadyUnliked: data.already_unliked
                        }));
                    } else if (data.type === 'complete') {
                        setProgress(prev => ({ 
                            ...prev, 
                            current: data.total_processed || response.company_ids.length,
                            total: data.total_processed || response.company_ids.length,
                            message: `✅ ${data.message || 'Operation completed'}`,
                            isActive: false,
                            newlyUnliked: data.newly_unliked,
                            alreadyUnliked: data.already_unliked
                        }));
                        
                        setSnackbar({
                            open: true,
                            message: data.message || 'Operation completed successfully',
                            severity: 'success'
                        });
                        onSuccess();
                    } else if (data.type === 'error') {
                        setProgress(prev => ({ ...prev, isActive: false }));
                        setSnackbar({
                            open: true,
                            message: data.message || 'Failed to unlike companies',
                            severity: 'error'
                        });
                    }
                });
            } else {
                // Fallback to the old collection transfer logic
                await addCompaniesToCollectionStream(targetCollectionId, response.company_ids, () => {
                    // Handle streaming response
                });
                setProgress(prev => ({ 
                    ...prev, 
                    current: response.company_ids.length,
                    total: response.company_ids.length,
                    message: "✅ All companies transferred successfully",
                    isActive: false
                }));
                setSnackbar({
                    open: true,
                    message: "All companies transferred successfully",
                    severity: 'success'
                });
                onSuccess();
            }
        } catch (error) {
            setProgress(prev => ({ ...prev, isActive: false }));
            setSnackbar({
                open: true,
                message: 'Failed to process all companies. Please try again.',
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
                        {sourceCollectionName === "My List" ? "❤️ Like Companies" : 
                         sourceCollectionName === "Liked Companies List" ? "💔 Unlike Companies" : 
                         `📁 Transfer to ${targetCollectionName}`}
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
                            background: sourceCollectionName === "Liked Companies List" 
                                ? 'linear-gradient(45deg, #f44336 30%, #ff5722 90%)'
                                : 'linear-gradient(45deg, #1976d2 30%, #42a5f5 90%)',
                            '&:hover': {
                                background: sourceCollectionName === "Liked Companies List"
                                    ? 'linear-gradient(45deg, #d32f2f 30%, #f44336 90%)'
                                    : 'linear-gradient(45deg, #1565c0 30%, #1976d2 90%)',
                            }
                        }}
                    >
                        {modalLoading ? 'Processing...' : 
                         sourceCollectionName === "My List" ? `Like Selected (${selectedCompanyIds.length})` :
                         sourceCollectionName === "Liked Companies List" ? `Unlike Selected (${selectedCompanyIds.length})` :
                         `Transfer Selected (${selectedCompanyIds.length})`}
                    </Button>

                    <Button
                        variant="outlined"
                        onClick={handleAddAll}
                        disabled={modalLoading}
                        startIcon={modalLoading ? <CircularProgress size={16} /> : null}
                        sx={{ 
                            minWidth: 200,
                            borderColor: sourceCollectionName === "Liked Companies List" ? '#f44336' : '#ff9800',
                            color: sourceCollectionName === "Liked Companies List" ? '#f44336' : '#ff9800',
                            '&:hover': {
                                borderColor: sourceCollectionName === "Liked Companies List" ? '#d32f2f' : '#f57c00',
                                backgroundColor: sourceCollectionName === "Liked Companies List" 
                                    ? 'rgba(244, 67, 54, 0.04)' 
                                    : 'rgba(255, 152, 0, 0.04)',
                            }
                        }}
                    >
                        {modalLoading ? 'Processing...' : 
                         sourceCollectionName === "My List" ? `Like All from ${sourceCollectionName}` :
                         sourceCollectionName === "Liked Companies List" ? `Unlike All from ${sourceCollectionName}` :
                         `Add All from ${sourceCollectionName}`}
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
                        
                        {/* Show like/unlike counts if available */}
                        {progress.message && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                {progress.message.includes('Successfully liked') ? '✅ Like operation completed' : 
                                 progress.message.includes('Successfully unliked') ? '❌ Unlike operation completed' : 
                                 '✅ Operation completed'}
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
                title={sourceCollectionName === "My List" ? "Like Selected Companies" : 
                       sourceCollectionName === "Liked Companies List" ? "Unlike Selected Companies" : 
                       "Add Selected Companies"}
                message={sourceCollectionName === "My List" ? 
                    `Are you sure you want to like ${selectedCompanyIds.length} selected companies?` :
                    sourceCollectionName === "Liked Companies List" ?
                    `Are you sure you want to unlike ${selectedCompanyIds.length} selected companies?` :
                    `Are you sure you want to add ${selectedCompanyIds.length} selected companies to ${targetCollectionName}?`}
                confirmText={sourceCollectionName === "My List" ? "Like Companies" : 
                           sourceCollectionName === "Liked Companies List" ? "Unlike Companies" : 
                           "Add Companies"}
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
                title={sourceCollectionName === "My List" ? "Like All Companies" : 
                       sourceCollectionName === "Liked Companies List" ? "Unlike All Companies" : 
                       "Add All Companies"}
                message={sourceCollectionName === "My List" ? 
                    `This will like ALL companies from ${sourceCollectionName}. This operation may take some time due to database throttling.` :
                    sourceCollectionName === "Liked Companies List" ?
                    `This will unlike ALL companies from ${sourceCollectionName}. This operation may take some time due to database throttling.` :
                    `This will add ALL companies from ${sourceCollectionName} to ${targetCollectionName}. This operation may take some time due to database throttling.`}
                confirmText={sourceCollectionName === "My List" ? "Like All Companies" : 
                           sourceCollectionName === "Liked Companies List" ? "Unlike All Companies" : 
                           "Add All Companies"}
                cancelText="Cancel"
                severity="warning"
                loading={modalLoading}
                details={{
                    sourceCollection: sourceCollectionName,
                    targetCollection: targetCollectionName
                }}
            />

            {/* Progress Modal */}
            <ProgressModal
                open={showProgressModal}
                onClose={() => setShowProgressModal(false)}
                progress={progress}
            />
        </Card>
    );
}
