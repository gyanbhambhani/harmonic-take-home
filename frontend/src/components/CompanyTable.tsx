import { DataGrid, GridRowSelectionModel, GridRenderCellParams } from "@mui/x-data-grid";
import { useEffect, useState } from "react";
import { getCollectionsById, ICompany, toggleCompanyInCollection } from "../utils/jam-api";
import CollectionActions from "./CollectionActions";
import HeartIcon from "./HeartIcon";

const CompanyTable = (props: { 
  selectedCollectionId: string;
  myListCollectionId: string;
  likedCompaniesCollectionId: string;
}) => {
  const [response, setResponse] = useState<ICompany[]>([]);
  const [total, setTotal] = useState<number>();
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);
  const [collectionName, setCollectionName] = useState<string>("");

  useEffect(() => {
    getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
      (newResponse) => {
        setResponse(newResponse.companies);
        setTotal(newResponse.total);
        setCollectionName(newResponse.collection_name);
      }
    );
  }, [props.selectedCollectionId, offset, pageSize]);

  useEffect(() => {
    setOffset(0);
    setSelectedRows([]);
    // Reset response to empty array to show loading state
    setResponse([]);
  }, [props.selectedCollectionId]);

  const handleSuccess = () => {
    // Refresh the current collection data
    getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
      (newResponse) => {
        setResponse(newResponse.companies);
        setTotal(newResponse.total);
        setCollectionName(newResponse.collection_name);
        // Clear selection after successful operation
        setSelectedRows([]);
      }
    );
  };

  const handleToggleLike = async (companyId: number) => {
    try {
      // Toggle the company in the "Liked Companies" collection
      const likedCollectionId = props.likedCompaniesCollectionId;
      await toggleCompanyInCollection(likedCollectionId, companyId);
      
      // Refresh the data to show updated like status
      handleSuccess();
    } catch (error) {
      console.error('Error toggling like status:', error);
    }
  };

  // Determine target collection based on current collection
  const getTargetCollection = () => {
    if (collectionName === "My List") {
      return { id: props.likedCompaniesCollectionId, name: "Liked Companies List" };
    } else if (collectionName === "Liked Companies List") {
      return { id: props.myListCollectionId, name: "My List" };
    }
    return null;
  };

  const targetCollection = getTargetCollection();

  return (
    <div style={{ width: "100%" }}>
      {targetCollection && (
        <CollectionActions
          sourceCollectionId={props.selectedCollectionId}
          sourceCollectionName={collectionName}
          targetCollectionId={targetCollection.id}
          targetCollectionName={targetCollection.name}
          selectedCompanyIds={selectedRows.map(id => Number(id))}
          onSuccess={handleSuccess}
        />
      )}
      
      <div style={{ height: 600, width: "100%" }}>
        <DataGrid
          rows={response}
          rowHeight={50}
          columns={[
            {
              field: "liked",
              headerName: "Liked",
              width: 60,
              sortable: false,
              renderCell: (params: GridRenderCellParams) => (
                <HeartIcon
                  isLiked={params.row.liked}
                  onToggle={() => handleToggleLike(params.row.id)}
                  companyId={params.row.id}
                  companyName={params.row.company_name}
                />
              ),
            },
            { field: "id", headerName: "ID", width: 90 },
            { field: "company_name", headerName: "Company Name", width: 300 },
          ]}
          initialState={{
            pagination: {
              paginationModel: { page: 0, pageSize: 25 },
            },
          }}
          rowCount={total || 0}
          pagination
          checkboxSelection
          paginationMode="server"
          rowSelectionModel={selectedRows}
          onRowSelectionModelChange={(newSelection) => {
            setSelectedRows(newSelection);
          }}
          onPaginationModelChange={(newMeta) => {
            setPageSize(newMeta.pageSize);
            setOffset(newMeta.page * newMeta.pageSize);
          }}
          sx={{
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            },
          }}
        />
      </div>
    </div>
  );
};

export default CompanyTable;
