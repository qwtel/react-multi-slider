import React, { Component } from 'react';

import { pauseEvent, stopPropagation, linspace, ensureArray, undoEnsureArray } from './common';
import propTypes from './propTypes';

class Slider extends Component {

  static propTypes = propTypes

  static defaultProps = {
    min: 0,
    max: 100,
    step: 1,
    minDistance: 0,
    defaultValue: 0,
    orientation: 'horizontal',
    className: 'slider',
    handleClassName: 'handle',
    handleActiveClassName: 'active',
    barClassName: 'bar',
    withBars: false,
    pearling: false,
    disabled: false,
    snapDragDisabled: false,
    invert: false,
  }

  _getInitialState = () => {
    const {value, defaultValue} = this.props;

    const orValue = this._or(ensureArray(value), ensureArray(defaultValue));
    const zIndices = orValue.map((_, i) => i);
    const trimmedValue = orValue.map(v => this._trimAlignValue(v, this.props));

    return {
      zIndices,
      value: trimmedValue,
      index: -1,
      upperBound: 0,
      sliderLength: 0,
    };
  }

  constructor(props) {
    super(props);
    this.state = this._getInitialState();
  }

  // Keep the internal `value` consistent with an outside `value` if present.
  // This basically allows the slider to be a controlled component.
  componentWillReceiveProps(newProps) {
    const propsValue = ensureArray(newProps.value);
    const newValue = this._or(propsValue, this.state.value);
    this.state.value = newValue.map(v => this._trimAlignValue(v, newProps));

    // If an upperBound has not yet been determined (due to the component being hidden
    // during the mount event, or during the last resize), then calculate it now
    // if (this.state.upperBound === 0) {
    //   this._handleResize();
    // }
  }

  // Check if the arity of `value` or `defaultValue` matches the number of children (= number of custom handles).
  // If no custom handles are provided, just returns `value` if present and `defaultValue` otherwise.
  // If custom handles are present but neither `value` nor `defaultValue` are applicable the handles are spread out
  // equally.
  // TODO: better name? better solution?
  _or = (value, defaultValue) => {
    const {children, min, max} = this.props;

    const count = React.Children.count(children);

    switch (count) {
      case 0:
        return value.length > 0 ? value : defaultValue;
      case value.length:
        return value;
      case defaultValue.length:
        return defaultValue;
      default:
        return linspace(min, max, count);
    }
  }

  getValue() {
    return undoEnsureArray(this.state.value);
  }

  /*
  _handleResize = () => {
    // setTimeout of 0 gives element enough time to have assumed its new size if it is being resized
    setImmediate(() => {
      const {invert} = this.props;
      const {slider, handle0} = this.refs;

      const sliderNode = slider.getDOMNode();
      const handleNode = handle0.getDOMNode();
      const rect = sliderNode.getBoundingClientRect();

      const sliderMax = rect[this._posMaxKey()];
      const sliderMin = rect[this._posMinKey()];

      const sizeKey = this._sizeKey();

      this.setState({
        upperBound: sliderNode[sizeKey] - handleNode[sizeKey],
        sliderLength: Math.abs(sliderMax - sliderMin),
        handleSize: handleNode[sizeKey],
        sliderStart: invert ? sliderMax : sliderMin,
      });
    });
  }
  */

  // calculates the offset of a handle in pixels based on its value.
  _calcOffset = (value) => {
    const {min, max} = this.props;
    const {upperBound} = this.state;

    const ratio = (value - min) / (max - min);
    return ratio * upperBound;
  }

  // calculates the value corresponding to a given pixel offset, i.e. the inverse of `_calcOffset`.
  _calcValue = (offset) => {
    const {min, max} = this.props;
    const {upperBound} = this.state;

    const ratio = offset / upperBound;
    return ratio * (max - min) + min;
  }

  _buildHandleStyle = (value, i) => {
    const {min, max} = this.props;
    const {index, zIndices} = this.state;

    const posMinKey = this._posMinKey();
    const offset = value / (max - min) * 100;

    return {
      position: 'absolute',
      willChange: index >= 0 ? posMinKey : '',
      zIndex: zIndices.indexOf(i) + 1,
      [posMinKey]: `${offset}%`,
    };
  }

  _buildBarStyle = (valueFrom, valueTo) => {
    const {min, max} = this.props;
    const {index} = this.state;

    const posMinKey = this._posMinKey();
    const posMaxKey = this._posMaxKey();

    const posMin = valueFrom / (max - min) * 100;
    const posMax = valueTo / (max - min) * 100;

    return {
      position: 'absolute',
      willChange: index >= 0 ? `${posMinKey}, ${posMaxKey}` : '',
      [posMinKey]: `${posMin}%`,
      [posMaxKey]: `${posMax}%`,
    };
  }

  _getClosestIndex = (pixelOffset) => {
    const {value} = this.state;

    let minDist = Number.MAX_VALUE;
    let closestIndex = -1;

    for (let [i, v] of value.entries()) {
      const offset = this._calcOffset(v);
      const dist = Math.abs(pixelOffset - offset);

      if (dist <= minDist) {
        minDist = dist;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  _calcOffsetFromPosition = (position) => {
    const {invert} = this.props;
    const {sliderStart, sliderLength, handleSize} = this.state;

    let pixelOffset = position - sliderStart;
    if (invert) pixelOffset = sliderLength - pixelOffset;
    pixelOffset -= (handleSize / 2);

    return pixelOffset;
  }

  // Snaps the nearest handle to the value corresponding to `position` and calls `callback` with that handle's index.
  _forceValueFromPosition = (position, callback) => {
    const {minDistance} = this.props;

    const pixelOffset = this._calcOffsetFromPosition(position);
    const closestIndex = this._getClosestIndex(pixelOffset);
    const nextValue = this._trimAlignValue(this._calcValue(pixelOffset));

    const value = [...this.state.value]; // Clone this.state.value since we'll modify it temporarily
    value[closestIndex] = nextValue;

    // Prevents the slider from shrinking below `props.minDistance`
    for (let [i] of value.entries()) {
      if (value[i + 1] - value[i] < minDistance) return;
    }

    this.setState({value}, () => callback(closestIndex));
  }

  _getMousePosition= (e) => {
    return [
      e[`page${this._axisKey()}`],
      e[`page${this._orthogonalAxisKey()}`],
    ];
  }

  _getTouchPosition = (e) => {
    const touch = e.touches[0];
    return [
      touch[`page${this._axisKey()}`],
      touch[`page${this._orthogonalAxisKey()}`],
    ];
  }

  _getMouseEventMap = () => {
    return [
      ['mousemove', this._onMouseMove],
      ['mouseup', this._onMouseUp],
    ];
  }

  _getTouchEventMap = () => {
    return [
      ['touchmove', this._onTouchMove],
      ['touchend', this._onTouchEnd],
    ];
  }

  // create the `mousedown` handler for the i-th handle
  _createOnMouseDown = (i) => {
    return e => {
      if (this.props.disabled) return;

      const [position] = this._getMousePosition(e);
      this._start(i, position);
      this._addHandlers(this._getMouseEventMap());

      pauseEvent(e);
    };
  }

  // create the `touchstart` handler for the i-th handle
  _createOnTouchStart = (i) => {
    return e => {
      if (this.props.disabled || e.touches.length > 1) return;

      const positions = this._getTouchPosition(e);
      const [position] = positions;

      this.startPosition = positions;
      this.isScrolling = undefined; // don't know yet if the user is trying to scroll

      this._start(i, position);
      this._addHandlers(this._getTouchEventMap());

      stopPropagation(e);
    };
  }

  _addHandlers = (eventMap) => {
    for (let [key, func] of eventMap) {
      document.addEventListener(key, func, false);
    }
  }

  _removeHandlers = (eventMap) => {
    for (let [key, func] of eventMap) {
      document.removeEventListener(key, func, false);
    }
  }

  _takeMeasurements = () => {
    const {invert} = this.props;
    const {slider} = this.refs;

    const sliderNode = slider.getDOMNode();
    const rect = sliderNode.getBoundingClientRect();

    const sliderMax = rect[this._posMaxKey()];
    const sliderMin = rect[this._posMinKey()];
    const sizeKey = this._sizeKey();

    this.sliderUpperBound = sliderNode[sizeKey];
    this.sliderLength = Math.abs(sliderMax - sliderMin);
    this.sliderStart = invert ? sliderMax : sliderMin;
  }

  _start = (index, startPosition) => {
    const {zIndices, value} = this.state;

    this._takeMeasurements();

    // if activeElement is body window will lost focus in IE9
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }

    this.hasMoved = false;

    this._fireChangeEvent('onBeforeChange');

    zIndices.splice(zIndices.indexOf(index), 1); // remove wherever the element is
    zIndices.push(index); // add to end

    this.setState({
      index,
      zIndices,
      startPosition,
      startValue: value[index],
    });
  }

  _onMouseUp = () => {
    this._onEnd(this._getMouseEventMap());
  }

  _onTouchEnd = () => {
    this._onEnd(this._getTouchEventMap());
  }

  _onEnd = (eventMap) => {
    this._removeHandlers(eventMap);
    this.setState({index: -1}, () => this._fireChangeEvent('onAfterChange'));
  }

  _onMouseMove = (e) => {
    const [position] = this._getMousePosition(e);
    this._move(position);
  }

  _onTouchMove = (e) => {
    if (e.touches.length > 1) return;

    const [positionMainDir, positionScrollDir] = this._getTouchPosition(e);
    const [startPositionMainDir, startPositionScrollDir] = this.startPosition;

    if (typeof this.isScrolling === 'undefined') {
      const diffMainDir = positionMainDir - startPositionMainDir;
      const diffScrollDir = positionScrollDir - startPositionScrollDir;
      this.isScrolling = Math.abs(diffScrollDir) > Math.abs(diffMainDir);
    }

    if (this.isScrolling) {
      this.setState({index: -1});
      return;
    }

    pauseEvent(e);

    this._move(positionMainDir);
  }

  _move = (position) => {
    this.hasMoved = true;

    const { props, state } = this;
    const { min, max, minDistance, invert, } = props;
    const { index, value, startPosition, startValue } = state;

    const { length } = value;
    const oldValue = value[index];

    let diffPosition = position - startPosition;
    if (invert) diffPosition *= -1;

    const diffValue = diffPosition / this.sliderLength * (max - min);

    let newValue = this._trimAlignValue(startValue + diffValue);

    // if "pearling" (= handles pushing each other) is disabled,
    // prevent the handle from getting closer than `minDistance` to the previous or next handle.
    if (!props.pearling) {
      if (index > 0) {
        const valueBefore = value[index - 1];
        if (newValue < valueBefore + minDistance) {
          newValue = valueBefore + minDistance;
        }
      }

      if (index < length - 1) {
        const valueAfter = value[index + 1];
        if (newValue > valueAfter - minDistance) {
          newValue = valueAfter - minDistance;
        }
      }
    }

    value[index] = newValue;

    // if "pearling" is enabled, let the current handle push the pre- and succeeding handles.
    if (props.pearling && length > 1) {
      if (newValue > oldValue) {
        this._pushSucceeding(value, minDistance, index);
        this._trimSucceeding(length, value, minDistance, max);
      } else if (newValue < oldValue) {
        this._pushPreceding(value, minDistance, index);
        this._trimPreceding(length, value, minDistance, min);
      }
    }

    // Normally you would use `shouldComponentUpdate`, but since the slider is a low-level component,
    // the extra complexity might be worth the extra performance.
    if (newValue !== oldValue) {
      this.setState({value}, this._fireChangeEvent.bind(this, 'onChange'));
    }
  }

  _pushSucceeding = (value, minDistance, index) => {
    for (let i = index, padding = value[i] + minDistance;
         value[i + 1] && padding > value[i + 1];
         i++, padding = value[i] + minDistance) {
      value[i + 1] = this._alignValue(padding);
    }
  }

  _trimSucceeding = (length, nextValue, minDistance, max) => {
    for (let i = 0; i < length; i++) {
      let padding = max - i * minDistance;
      if (nextValue[length - 1 - i] > padding) {
        nextValue[length - 1 - i] = padding;
      }
    }
  }

  _pushPreceding = (value, minDistance, index) => {
    for (let i = index, padding = value[i] - minDistance;
         value[i - 1] && padding < value[i - 1];
         i--, padding = value[i] - minDistance) {
      value[i - 1] = this._alignValue(padding);
    }
  }

  _trimPreceding = (length, nextValue, minDistance, min) => {
    for (let i = 0; i < length; i++) {
      let padding = min + i * minDistance;
      if (nextValue[i] < padding) {
        nextValue[i] = padding;
      }
    }
  }

  _axisKey = () => {
    const {orientation} = this.props;
    if (orientation === 'horizontal') return 'X';
    if (orientation === 'vertical') return 'Y';
  }

  _orthogonalAxisKey = () => {
    const {orientation} = this.props;
    if (orientation === 'horizontal') return 'Y';
    if (orientation === 'vertical') return 'X';
  }

  _posMinKey = () => {
    const {orientation, invert} = this.props;
    if (orientation === 'horizontal') return invert ? 'right' : 'left';
    if (orientation === 'vertical') return invert ? 'bottom' : 'top';
  }

  _posMaxKey = () => {
    const {orientation, invert} = this.props;
    if (orientation === 'horizontal') return invert ? 'left' : 'right';
    if (orientation === 'vertical') return invert ? 'top' : 'bottom';
  }

  _sizeKey = () => {
    const {orientation} = this.props;
    if (orientation === 'horizontal') return 'clientWidth';
    if (orientation === 'vertical') return 'clientHeight';
  }

  _trimAlignValue = (val, props) => {
    return this._alignValue(this._trimValue(val, props), props);
  }

  _trimValue = (val, props) => {
    const {min, max} = props || this.props;

    if (val <= min) return min;
    if (val >= max) return max;

    return val;
  }

  _alignValue = (val, props) => {
    const {min, step} = props || this.props;

    const valModStep = (val - min) % step;

    let alignValue = val - valModStep;
    if (Math.abs(valModStep) * 2 >= step) {
      alignValue += valModStep > 0 ? step : -step;
    }

    return parseFloat(alignValue.toFixed(5));
  }

  _renderHandle = (style, child, i) => {
    const {handleClassName, handleActiveClassName} = this.props;
    const {index} = this.state;

    const isActive = index === i ? handleActiveClassName : '';
    const className = `${handleClassName} ${handleClassName}-${i} ${isActive}`;

    return (
      <div
        key={`handle-${i}`}
        ref={`handle${i}`}
        className={className}
        style={style}
        onMouseDown={this._createOnMouseDown(i)}
        onTouchStart={this._createOnTouchStart(i)}
        >
        {child}
      </div>
    );
  }

  _renderHandles = (value) => {
    const {children} = this.props;

    const styles = value.map(this._buildHandleStyle);

    if (React.Children.count(children) > 0) {
      return React.Children.forEach(children, (child, i) => this._renderHandle(styles[i], child, i));
    }

    return styles.map(((style, i) => this._renderHandle(style, null, i)));
  }

  _renderBar = (i, valueFrom, valueTo) => {
    const {barClassName, min, max} = this.props;

    const className = `${barClassName} ${barClassName}-${i}`;
    const style = this._buildBarStyle(valueFrom + min, max - valueTo);

    return (
      <div
        key={`bar-${i}`}
        ref={`bar${i}`}
        className={className}
        style={style}
        />
    );
  }

  _renderBars = (value) => {
    const {min, max} = this.props;

    const lastIndex = value.length - 1;

    const firstBar = this._renderBar(0, min, value[0]);
    const lastBar = this._renderBar(lastIndex + 1, value[lastIndex], max);
    const bars = value
      .filter((v, i) => i !== lastIndex)
      .map((v, i) => this._renderBar(i + 1, v, value[i + 1]));

    return [firstBar, ...bars, lastBar];
  }

  _onSliderMouseDown = (e) => {
    const {disabled, snapDragDisabled} = this.props;
    if (disabled) return;

    this.hasMoved = false;

    if (!snapDragDisabled) {
      const [position] = this._getMousePosition(e);
      this._forceValueFromPosition(position, i => {
        this._fireChangeEvent('onChange');
        this._start(i, position);
        this._addHandlers(this._getMouseEventMap());
      });
    }

    pauseEvent(e);
  }

  _onSliderClick = (e) => {
    const {disabled, onSliderClick} = this.props;
    if (disabled) return;

    if (onSliderClick && !this.hasMoved) {
      const position = this._getMousePosition(e);
      const valueAtPos = this._trimAlignValue(this._calcValue(this._calcOffsetFromPosition(position[0])));
      onSliderClick(valueAtPos);
    }
  }

  _fireChangeEvent = (eventType) => {
    const {value} = this.state;
    const callback = this.props[eventType];
    if (callback) {
      callback(undoEnsureArray(value));
    }
  }

  render() {
    const {className, disabled, withBars} = this.props;
    const {value} = this.state;

    // const offset = value.map(this._calcOffset);
    const bars = withBars ? this._renderBars(value) : null;
    const handles = this._renderHandles(value);

    return (
      <div
        ref="slider"
        style={{position: 'relative'}}
        className={className + (disabled ? ' disabled' : '')}
        onMouseDown={this._onSliderMouseDown}
        onClick={this._onSliderClick}
        >
        {bars}
        {handles}
      </div>
    );
  }
}

export default Slider;
