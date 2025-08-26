import { DataGrid, GridRowSelectionModel } from "@mui/x-data-grid";
import { useEffect, useState } from "react";
import { getCollectionsById, ICompany } from "../utils/jam-api";
import CollectionActions from "./CollectionActions";

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
  }, [props.selectedCollectionId]);

  const handleSuccess = () => {
    // Refresh the current collection data
    getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
      (newResponse) => {
        setResponse(newResponse.companies);
        setTotal(newResponse.total);
        setCollectionName(newResponse.collection_name);
      }
    );
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
          rowHeight={30}
          columns={[
            { field: "liked", headerName: "Liked", width: 90 },
            { field: "id", headerName: "ID", width: 90 },
            { field: "company_name", headerName: "Company Name", width: 200 },
          ]}
          initialState={{
            pagination: {
              paginationModel: { page: 0, pageSize: 25 },
            },
          }}
          rowCount={total}
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
        />
      </div>
    </div>
  );
};

export default CompanyTable;
