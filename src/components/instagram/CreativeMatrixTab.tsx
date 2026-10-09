import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { MatrizAgentePanel } from "./MatrizAgentePanel";

export function CreativeMatrixTab() {
  return (
    <Box sx={{ mt: 2 }}>
      <Typography sx={{ fontWeight: 600 }}>Agente de Matriz Criativa</Typography>
      <MatrizAgentePanel />
    </Box>
  );
}
