
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const CustomAngleCircleRadialBarChart: React.FC = () => {
  // Chart
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series = [100, 90, 80, 70];

  const options: ApexOptions = {
    plotOptions: {
      radialBar: {
        offsetY: 0,
        startAngle: 0,
        endAngle: 270,
        hollow: {
          margin: 10,
          size: "30%",
          image: undefined,
          background: "transparent",
        },
        dataLabels: {
          name: {
            show: false,
          },
          value: {
            show: false,
          },
        },
      },
    },
    colors: ["#757FEF", "#9EA5F4", "#C8CCF9", "#F1F2FD"],
    labels: ["Completed", "Active", "Assigned", "Pending"],
    legend: {
      show: true,
      offsetY: 0,
      offsetX: -20,
      floating: true,
      position: "left",
      fontSize: "13px",
      labels: {
        colors: "#64748B",
      },
      formatter: function (seriesName, opts) {
        return seriesName + ":  " + opts.w.globals.series[opts.seriesIndex];
      },
      itemMargin: {
        horizontal: 0,
        vertical: 4,
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Custom Angle Circle RadialBar Chart</h5>
          </div>
        </div>
        <div className="trezo-card-content">
          {ChartComponent ? (
            <ChartComponent
              options={options}
              series={series}
              type="radialBar"
              height={300}
              width={"100%"}
            />
          ) : (
            <div>Loading chart...</div>
          )}
        </div>
      </div>
    </>
  );
};

export default CustomAngleCircleRadialBarChart;
