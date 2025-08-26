import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Chip,
    CircularProgress
} from '@mui/material';
import { useState } from 'react';

interface ConfirmationModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    severity?: 'info' | 'warning' | 'danger';
    loading?: boolean;
    details?: {
        companies?: string[];
        count?: number;
        sourceCollection?: string;
        targetCollection?: string;
    };
}

export default function ConfirmationModal({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    severity = 'info',
    loading = false,
    details
}: ConfirmationModalProps) {
    const getSeverityColor = () => {
        switch (severity) {
            case 'warning':
                return '#ff9800';
            case 'danger':
                return '#f44336';
            default:
                return '#1976d2';
        }
    };

    const getSeverityBgColor = () => {
        switch (severity) {
            case 'warning':
                return 'rgba(255, 152, 0, 0.1)';
            case 'danger':
                return 'rgba(244, 67, 54, 0.1)';
            default:
                return 'rgba(25, 118, 210, 0.1)';
        }
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    backgroundColor: 'rgba(33, 33, 33, 0.95)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                }
            }}
        >
            <DialogTitle sx={{ 
                borderBottom: `2px solid ${getSeverityColor()}`,
                backgroundColor: getSeverityBgColor(),
                color: 'text.primary'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {loading && <CircularProgress size={20} sx={{ color: getSeverityColor() }} />}
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {title}
                    </Typography>
                </Box>
            </DialogTitle>
            
            <DialogContent sx={{ pt: 3 }}>
                <Typography variant="body1" sx={{ mb: 2, color: 'text.primary' }}>
                    {message}
                </Typography>
                
                {details && (
                    <Box sx={{ mt: 2 }}>
                        {details.count && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Chip 
                                    label={`${details.count} companies`} 
                                    size="small" 
                                    color="primary"
                                    sx={{ backgroundColor: getSeverityColor() }}
                                />
                            </Box>
                        )}
                        
                        {details.sourceCollection && details.targetCollection && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <Typography variant="body2" color="text.secondary">
                                    From: <strong>{details.sourceCollection}</strong>
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    To: <strong>{details.targetCollection}</strong>
                                </Typography>
                            </Box>
                        )}
                        
                        {details.companies && details.companies.length > 0 && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    Companies to be affected:
                                </Typography>
                                <Box sx={{ 
                                    maxHeight: 120, 
                                    overflowY: 'auto',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: 1,
                                    p: 1
                                }}>
                                    {details.companies.slice(0, 10).map((company, index) => (
                                        <Typography key={index} variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                            • {company}
                                        </Typography>
                                    ))}
                                    {details.companies.length > 10 && (
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                                            ... and {details.companies.length - 10} more
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        )}
                    </Box>
                )}
            </DialogContent>
            
            <DialogActions sx={{ p: 2, gap: 1 }}>
                <Button 
                    onClick={onClose} 
                    disabled={loading}
                    variant="outlined"
                    sx={{ 
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        color: 'text.primary',
                        '&:hover': {
                            borderColor: 'rgba(255, 255, 255, 0.5)',
                        }
                    }}
                >
                    {cancelText}
                </Button>
                <Button 
                    onClick={onConfirm} 
                    disabled={loading}
                    variant="contained"
                    sx={{ 
                        backgroundColor: getSeverityColor(),
                        '&:hover': {
                            backgroundColor: getSeverityColor(),
                            opacity: 0.8,
                        }
                    }}
                >
                    {loading ? 'Processing...' : confirmText}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
