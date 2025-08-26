import { IconButton, Tooltip } from '@mui/material';
import { Favorite, FavoriteBorder } from '@mui/icons-material';
import { useState } from 'react';

interface HeartIconProps {
    isLiked: boolean;
    onToggle: () => void;
    companyId: number;
    companyName: string;
}

export default function HeartIcon({ isLiked, onToggle, companyId, companyName }: HeartIconProps) {
    const [isHovered, setIsHovered] = useState(false);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row selection
        onToggle();
    };

    return (
        <Tooltip title={isLiked ? `Remove ${companyName} from liked` : `Add ${companyName} to liked`}>
            <IconButton
                size="small"
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                sx={{
                    color: isLiked ? '#e91e63' : '#666',
                    '&:hover': {
                        color: isLiked ? '#c2185b' : '#e91e63',
                        transform: 'scale(1.1)',
                    },
                    transition: 'all 0.2s ease-in-out',
                }}
            >
                {isLiked ? (
                    <Favorite fontSize="small" />
                ) : (
                    <FavoriteBorder fontSize="small" />
                )}
            </IconButton>
        </Tooltip>
    );
}
