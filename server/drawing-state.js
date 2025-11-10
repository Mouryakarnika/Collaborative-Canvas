class DrawingState {
  constructor(){
    this.history = []; // array of operations (strokes)
    this.undone = []; // stack for redo
  }

  getHistory(){ return this.history.slice(); }

  startStroke(stroke){
    // add minimal placeholder (points may be expanded later)
    this.history.push(stroke);
    // once new op arrives, clear redo stack
    this.undone = [];
  }

  appendPoints(strokeId, points){
    const op = this.history.find(o=>o.id === strokeId);
    if(op){
      op.points = op.points.concat(points || []);
    }
  }

  endStroke(stroke){
    const idx = this.history.findIndex(o=>o.id === stroke.id);
    if(idx === -1){
      // finalizing unknown stroke -> push
      this.history.push(stroke);
    } else {
      this.history[idx] = stroke; // canonical
    }
  }

  undo(){
    if(this.history.length === 0) return null;
    const op = this.history.pop();
    this.undone.push(op);
    return op.id;
  }

  redo(){
    if(this.undone.length === 0) return null;
    const op = this.undone.pop();
    this.history.push(op);
    return op;
  }
}

module.exports = { DrawingState };
