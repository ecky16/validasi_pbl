import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { FiberNode } from "@/src/types";

interface TechnicalTableProps {
  data: FiberNode[];
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
}

export function TechnicalTable({ data = [], isAdmin = false, onDelete }: TechnicalTableProps) {
  const safeData = data || [];
  return (
    <div className="rounded-md border bg-white overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead className="font-semibold text-slate-700">FTM / GPON</TableHead>
            <TableHead className="font-semibold text-slate-700">OA (R/P/P)</TableHead>
            <TableHead className="font-semibold text-slate-700">EA (R/P/P)</TableHead>
            <TableHead className="font-semibold text-slate-700">ODC Name</TableHead>
            <TableHead className="font-semibold text-slate-700">ODC Feeder (P/P)</TableHead>
            <TableHead className="font-semibold text-slate-700">ODC Dist (P/P)</TableHead>
            <TableHead className="font-semibold text-slate-700">ODP Name</TableHead>
            <TableHead className="font-semibold text-slate-700 text-center">Status</TableHead>
            <TableHead className="font-semibold text-slate-700">Technician</TableHead>
            {isAdmin && <TableHead className="font-semibold text-slate-700 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {safeData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isAdmin ? 10 : 9} className="text-center py-10 text-slate-500">
                No technical data found.
              </TableCell>
            </TableRow>
          ) : (
            safeData.map((node) => (
              <TableRow key={node.id} className="hover:bg-slate-50/50 transition-colors">
                <TableCell>
                  <div className="font-medium text-slate-900">{node.ftm_name}</div>
                  <div className="text-[10px] text-slate-500">{node.gpon_name}</div>
                </TableCell>
                <TableCell className="text-xs font-mono">
                  {node.oa_rak}/{node.oa_panel}/{node.oa_port}
                </TableCell>
                <TableCell className="text-xs font-mono">
                  {node.ea_rak}/{node.ea_panel}/{node.ea_port}
                </TableCell>
                <TableCell className="text-slate-700 font-medium">{node.odc_name}</TableCell>
                <TableCell className="text-xs font-mono">
                  {node.odc_feeder_panel}/{node.odc_feeder_port}
                </TableCell>
                <TableCell className="text-xs font-mono">
                  {node.odc_dist_panel}/{node.odc_dist_port}
                </TableCell>
                <TableCell className="font-bold text-blue-600">{node.odp_name}</TableCell>
                <TableCell className="text-center">
                  <Badge 
                    variant="outline" 
                    className={
                      node.status === 'VALID' 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]" 
                        : "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                    }
                  >
                    {node.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-slate-600 text-[10px] font-medium">{node.technician_name}</div>
                  <div className="text-[9px] text-slate-400">{node.lastValidatedAt}</div>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => onDelete?.(node.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
