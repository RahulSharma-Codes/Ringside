import React, { useState } from "react";
import { useListOpenActions, getListOpenActionsQueryKey, useUpdateAction, useDeleteAction } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertTriangle, PlayCircle, Circle, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isPast, parseISO } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";

export default function Actions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [priorityFilter, setPriorityFilter] = useState("all");

  const { data: actions, isLoading } = useListOpenActions({
    query: {
      queryKey: getListOpenActionsQueryKey()
    }
  });

  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();

  const handleStatusChange = (id: number, newStatus: string) => {
    updateAction.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Status updated" });
          queryClient.invalidateQueries({ queryKey: getListOpenActionsQueryKey() });
        },
        onError: () => {
          toast({ title: "Error", description: "Could not update action", variant: "destructive" });
        }
      }
    );
  };

  const handleDeleteAction = (id: number) => {
    deleteAction.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Action deleted" });
          queryClient.invalidateQueries({ queryKey: getListOpenActionsQueryKey() });
        },
        onError: () => {
          toast({ title: "Error", description: "Could not delete action", variant: "destructive" });
        }
      }
    );
  };

  const filteredActions = actions?.filter(a => priorityFilter === "all" || a.priority === priorityFilter) || [];

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "Critical": return <AlertTriangle size={14} className="text-destructive" />;
      case "High": return <AlertTriangle size={14} className="text-amber-500" />;
      case "Medium": return <Circle size={14} className="text-primary" />;
      default: return <Circle size={14} className="text-muted-foreground" />;
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Action Tracker</h1>
          <p className="text-sm text-muted-foreground">Centralized view of all open deal activities</p>
        </div>
        
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[180px] rounded-sm font-mono text-[11px] uppercase border-border bg-background/50">
            <SelectValue placeholder="Filter Priority" />
          </SelectTrigger>
          <SelectContent className="rounded-sm font-mono text-[11px] uppercase">
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 border border-border rounded-sm bg-card/50 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-[30px]"></TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Action</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Target</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Owner</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Due Date</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-right">Update Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[250px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-[120px] ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredActions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
                    No open actions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredActions.map((action) => {
                  const isOverdue = action.dueDate && isPast(parseISO(action.dueDate));
                  
                  return (
                    <TableRow key={action.id} className="border-border hover:bg-muted/30 transition-colors group">
                      <TableCell>
                        <div title={action.priority}>
                          {getPriorityIcon(action.priority)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{action.description}</div>
                        <div className="font-mono text-[10px] text-muted-foreground uppercase flex items-center gap-2 mt-1">
                          <span className={
                            action.status === "In Progress" ? "text-primary" :
                            action.status === "Blocked" ? "text-destructive" : ""
                          }>
                            {action.status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/targets/${action.targetId}`} className="text-sm font-medium hover:underline hover:text-primary transition-colors">
                          {action.targetName || `Target #${action.targetId}`}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {action.owner || "Unassigned"}
                      </TableCell>
                      <TableCell>
                        {action.dueDate ? (
                          <div className={`flex items-center gap-1.5 text-sm ${isOverdue ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                            <Clock size={12} />
                            {format(parseISO(action.dueDate), 'MMM d')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 items-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteAction(action.id)}
                            disabled={deleteAction.isPending}
                          >
                            <Trash2 size={12} />
                          </Button>
                          {action.status !== "In Progress" && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 text-[10px] font-mono uppercase rounded-sm border-border"
                              onClick={() => handleStatusChange(action.id, "In Progress")}
                              disabled={updateAction.isPending}
                            >
                              <PlayCircle size={12} className="mr-1" /> Start
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="default" 
                            className="h-7 text-[10px] font-mono uppercase rounded-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleStatusChange(action.id, "Completed")}
                            disabled={updateAction.isPending}
                          >
                            <CheckCircle2 size={12} className="mr-1" /> Done
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
