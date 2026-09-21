import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCandidates, useScheduleInterview } from "@/lib/queries";

export function ScheduleInterviewDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [interviewer, setInterviewer] = useState("");
  const [location, setLocation] = useState("");

  const candidates = useCandidates();
  const schedule = useScheduleInterview();
  const list = candidates.data ?? [];

  async function submit() {
    const candidate = list.find((c) => c.id === candidateId);
    if (!candidate || !date || !time || !interviewer.trim()) {
      toast.error("Pick a candidate and fill in date, time and interviewer.");
      return;
    }
    try {
      await schedule.mutateAsync({
        candidate,
        interviewAt: `${date}T${time}`,
        interviewer: interviewer.trim(),
        location: location.trim(),
      });
      toast.success(`Interview scheduled for ${candidate.full_name}.`);
      setOpen(false);
      setCandidateId("");
      setDate("");
      setInterviewer("");
      setLocation("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not schedule the interview.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule an interview</DialogTitle>
          <DialogDescription>
            The candidate is moved to the interview stage and the date is added to the calendar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Candidate</Label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a candidate" />
              </SelectTrigger>
              <SelectContent>
                {list.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                    {c.applied_role ? ` — ${c.applied_role}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="interview-date">Date</Label>
              <Input
                id="interview-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interview-time">Time</Label>
              <Input
                id="interview-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="interviewer">Interviewer</Label>
            <Input
              id="interviewer"
              placeholder="e.g. Priya Sharma"
              value={interviewer}
              onChange={(e) => setInterviewer(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-location">Location or meeting link</Label>
            <Input
              id="interview-location"
              placeholder="Video call link or office address"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={schedule.isPending}>
            {schedule.isPending ? "Scheduling…" : "Schedule interview"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
