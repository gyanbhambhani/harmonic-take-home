import { 
    Dialog, 
    DialogTitle, 
    DialogContent, 
    LinearProgress, 
    Typography, 
    Box, 
    Chip,
    IconButton,
    Collapse,
    List,
    ListItem,
    ListItemText,
    Divider
} from '@mui/material';
import { useState } from 'react';
import { Close, ExpandMore, ExpandLess } from '@mui/icons-material';

interface ProgressModalProps {
    open: boolean;
    onClose: () => void;
    progress: {
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
    };
}

export default function ProgressModal({ open, onClose, progress }: ProgressModalProps) {
    const [expanded, setExpanded] = useState(false);
    
    const progressPercentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
    
    const getOperationIcon = () => {
        return progress.operation === 'like' ? '❤️' : progress.operation === 'unlike' ? '💔' : '⚙️';
    };
    
    const getOperationTitle = () => {
        if (progress.operation === 'like') {
            return 'Liking Companies';
        } else if (progress.operation === 'unlike') {
            return 'Unliking Companies';
        }
        return 'Processing Companies';
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    position: 'fixed',
                    bottom: 20,
                    right: 20,
                    margin: 0,
                    maxHeight: expanded ? '70vh' : 'auto',
                    minHeight: expanded ? '300px' : 'auto',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    borderRadius: 2,
                }
            }}
        >
            <DialogTitle sx={{ 
                pb: 1, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                backgroundColor: progress.operation === 'like' ? 'rgba(76, 175, 80, 0.1)' : 
                               progress.operation === 'unlike' ? 'rgba(244, 67, 54, 0.1)' : 
                               'rgba(33, 150, 243, 0.1)'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                        {getOperationIcon()} {getOperationTitle()}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton
                        size="small"
                        onClick={() => setExpanded(!expanded)}
                        sx={{ color: 'text.secondary' }}
                    >
                        {expanded ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={onClose}
                        sx={{ color: 'text.secondary' }}
                    >
                        <Close />
                    </IconButton>
                </Box>
            </DialogTitle>
            
            <DialogContent sx={{ pt: 1, pb: 2 }}>
                {/* Progress Bar */}
                <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            {progress.current} of {progress.total} companies
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {Math.round(progressPercentage)}%
                        </Typography>
                    </Box>
                    <LinearProgress 
                        variant="determinate" 
                        value={progressPercentage} 
                        sx={{ 
                            height: 8, 
                            borderRadius: 4,
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            '& .MuiLinearProgress-bar': {
                                background: progress.operation === 'like' ? 
                                    'linear-gradient(45deg, #4caf50 30%, #66bb6a 90%)' :
                                    progress.operation === 'unlike' ? 
                                    'linear-gradient(45deg, #f44336 30%, #ef5350 90%)' :
                                    'linear-gradient(45deg, #2196f3 30%, #42a5f5 90%)',
                            }
                        }}
                    />
                </Box>

                {/* Current Company */}
                {progress.currentCompany && (
                    <Box sx={{ mb: 2, p: 1.5, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            Currently processing:
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            {progress.currentCompany}
                        </Typography>
                    </Box>
                )}

                {/* Status Message */}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {progress.message}
                </Typography>

                {/* Stats */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                    {progress.newlyLiked !== undefined && (
                        <Chip 
                            label={`${progress.newlyLiked} newly liked`} 
                            size="small" 
                            color="success" 
                            variant="outlined"
                        />
                    )}
                    {progress.newlyUnliked !== undefined && (
                        <Chip 
                            label={`${progress.newlyUnliked} newly unliked`} 
                            size="small" 
                            color="error" 
                            variant="outlined"
                        />
                    )}
                    {progress.alreadyLiked !== undefined && progress.alreadyLiked > 0 && (
                        <Chip 
                            label={`${progress.alreadyLiked} already liked`} 
                            size="small" 
                            color="default" 
                            variant="outlined"
                        />
                    )}
                    {progress.alreadyUnliked !== undefined && progress.alreadyUnliked > 0 && (
                        <Chip 
                            label={`${progress.alreadyUnliked} already unliked`} 
                            size="small" 
                            color="default" 
                            variant="outlined"
                        />
                    )}
                </Box>

                {/* Expanded Details */}
                <Collapse in={expanded}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        You can navigate to other collections while this operation continues in the background.
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        The progress will continue updating and you'll be notified when it's complete.
                    </Typography>
                </Collapse>
            </DialogContent>
        </Dialog>
    );
}
